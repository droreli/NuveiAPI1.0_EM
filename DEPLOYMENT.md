# Production & Development Deployment Guide

## Branch Strategy

- **`main`** → Production environment
- **`develop`** → Development/Staging environment

## Deployment URLs

- **Production**: https://nuvei-api-emulator.ndocs.workers.dev/
- **Development**: https://nuvei-api-emulator-development.ndocs.workers.dev/

## Workflow

### Working on New Features

1. **Switch to develop branch**:
   ```bash
   git checkout develop
   ```

2. **Make your changes** and test locally:
   ```bash
   npm run dev
   ```
   Visit: http://localhost:8787

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "Add new feature"
   git push origin develop
   ```

4. **Deploy to Development/Staging**:
   ```bash
   npm run deploy:dev
   ```
   Test at: https://nuvei-api-emulator-development.ndocs.workers.dev/

5. **Once tested and working**, merge to main:
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

6. **Deploy to Production**:
   ```bash
   npm run deploy:prod
   ```

### Quick Deploy Commands

| Command | Branch | Deploys To |
|---------|--------|------------|
| `npm run dev` | Any | Local (http://localhost:8787) |
| `npm run deploy:dev` | develop | Development (staging) |
| `npm run deploy:prod` | main | Production |

## Best Practices

1. **Always test in development first** - Deploy to staging URL before pushing to production
2. **Keep branches in sync** - Regularly merge main into develop to avoid conflicts
3. **Use descriptive commit messages** - Makes it easier to track what changed
4. **Never push untested code to main** - Always go through develop branch first

## Troubleshooting

### If deployment fails:
```bash
# Check TypeScript errors
npm run check

# Build frontend manually
cd frontend && npm run build && cd ..

# Try deploying again
npm run deploy:dev  # or deploy:prod
```

### If you need to switch branches:
```bash
# Save your current work
git add .
git commit -m "Work in progress"

# Switch branch
git checkout main  # or develop

# Come back later
git checkout develop
```

### To sync develop with main changes:
```bash
git checkout develop
git merge main
git push origin develop
```
