# APM Fixes - Final Deployment (Version ce903b32-e2dc-4c9d-902a-4a8fc3d5a8e8)

## Critical Fixes Applied

### 1. ✅ PayPal Restored to APM List
**Problem**: PayPal (`apmgw_expresscheckout`) was being filtered out with card methods
**Fix**: Updated filter to only exclude actual card methods: `cc_card`, `ppp_ApplePay`, `ppp_GooglePay`
**Result**: PayPal now appears in APM list and can be used

### 2. ✅ Webhook Support Added for GET Requests
**Problem**: Nuvei DMN (Direct Merchant Notification) webhooks can be sent as GET or POST, but we only supported POST
**Fix**: 
- Added GET support to `/api/webhook` endpoint
- Updated `handleWebhook` function to parse query parameters for GET requests
- Maintained POST support with form-data and JSON parsing

**Why This Matters**: According to Nuvei documentation, DMN callbacks for APM transactions can be sent as:
- POST with `application/x-www-form-urlencoded`
- GET with query parameters
- POST with JSON

### 3. ✅ Improved APM Field Collection
**Status**: Already working - ACH, Skrill, Neteller show modals for field collection
**Redirect APMs**: iDEAL, Klarna, Sofort, PayPal work directly without extra fields

## Understanding "Unsupported Payment Method" Errors

Based on Nuvei documentation research, when you see this error, it means:

1. **Payment method not enabled** for your merchant account/site
2. **Not available** for the selected country/currency combination
3. **Not configured** for the transaction type (DEPOSIT vs WITHDRAWAL)

### What getMerchantPaymentMethods Does

- Returns **all payment methods enabled** for your merchant account
- Filters by `countryCode` and `currencyCode` 
- Shows only methods that **should work** for that combination

### Why Some APMs Still Fail

Even if an APM appears in the list, it may fail because:
- **Incomplete merchant configuration** - method is enabled but missing required setup
- **Country/currency mismatch** - the specific combination isn't fully supported
- **Account limitations** - sandbox account may have different restrictions

## Webhook Flow for APM Payments

```
1. User clicks "Test Payment" on APM
2. Frontend sends request to /api/apm/payment
3. Backend calls Nuvei /payment.do with:
   - notificationUrl: https://nuvei-api-emulator.ndocs.workers.dev/api/webhook
   - successUrl, failureUrl, pendingUrl for user redirects
4. Nuvei returns redirectUrl
5. User is redirected to APM provider (bank, wallet, etc.)
6. User completes payment
7. APM provider notifies Nuvei
8. Nuvei sends DMN to our /api/webhook endpoint (GET or POST)
9. We store webhook and display in UI
10. User is redirected back to successUrl/failureUrl
```

## Expected DMN Parameters

When a webhook arrives, you'll see:
- `Status`: `APPROVED`, `DECLINED`, `PENDING`, `UPDATE`
- `ppp_status`: `OK`, `FAIL`, etc.
- `PPP_TransactionID` or `TransactionID`
- `merchant_unique_id` (our clientUniqueId)
- `totalAmount`, `currency`
- `advanceResponseChecksum` (for verification)

## Testing Recommendations

### For Working APMs (like Trustly):
1. Select UK/GBP or appropriate country/currency
2. Click "Discover APMs"
3. Find Trustly in the list
4. Click "Test Payment"
5. Complete payment in popup (use test bank credentials)
6. **Wait 10-30 seconds** after completing payment
7. Check Webhooks tab - should see DMN with Status=APPROVED

### For "Unsupported" APMs:
These APMs appear in the list but fail:
- Likely **not fully configured** in your sandbox merchant account
- May need **specific country/currency** combinations
- Contact Nuvei support to enable these methods

### PayPal Testing:
- Now available in APM list
- Should redirect to PayPal sandbox
- Use test credentials from "Test Credentials" button

## File Changes Summary

### Backend (src/worker.ts):
1. Line ~1207: Updated APM filter to keep PayPal
2. Line ~2387: Added GET support to webhook endpoint  
3. Line ~856: Updated `handleWebhook` to parse GET query parameters
4. Line ~1324: Webhook URL correctly set to `${workerUrl}/api/webhook`

### No Frontend Changes Needed:
- Field collection modal already working
- Webhook polling already active
- APM payment flow already correct

## Next Steps for Full APM Testing

1. **Verify Merchant Configuration**:
   - Log into Nuvei Control Panel
   - Check which APMs are fully enabled for your test account
   - Ensure country/currency combinations are configured

2. **Test Each APM Type**:
   - **Redirect APMs** (PayPal, iDEAL, Klarna, Sofort): Should redirect then send webhook
   - **Direct APMs** (ACH): Should process immediately
   - **Wallet APMs** (Skrill, Neteller): Should redirect to wallet then send webhook

3. **Webhook Verification**:
   - After each successful payment, check Webhooks tab
   - Look for `Status=APPROVED` in webhook payload
   - Verify `PPP_TransactionID` is present

4. **Contact Nuvei Support** if:
   - APMs appear but consistently fail with "unsupported"
   - Webhooks never arrive (check your Nuvei account settings)
   - Need additional APMs enabled

## Deployed Version
- URL: https://nuvei-api-emulator.ndocs.workers.dev
- Version: ce903b32-e2dc-4c9d-902a-4a8fc3d5a8e8
- Timestamp: 2026-01-04

## Key Documentation References
- [getMerchantPaymentMethods](https://docs.nuvei.com/documentation/middle-east-africa-guides/lean/#example-getmerchantpaymentmethods-request)
- [Nuvei Webhooks/DMNs](https://docs.nuvei.com/documentation/integration/webhooks)
- [APM Input Parameters](https://docs.nuvei.com/documentation/apms-overview/apm-input-parameters)
- [Error Codes](https://docs.nuvei.com/documentation/integration/response-handling/#api-response-codes)
