# Website Deployment Guide

## Common 404 Error Fixes

### Issue: 404 Errors on GitHub Pages

If you're getting 404 errors when deploying to GitHub Pages, here are the solutions:

#### Solution 1: Check File Paths
GitHub Pages serves files from the repository root. Make sure:
- All HTML files are in the root directory
- The `public` folder is in the root directory
- Image paths use `public/` (relative paths)

#### Solution 2: Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings**
3. Scroll to **Pages**
4. Under **Source**, select your branch (usually `main` or `master`)
5. Click **Save**

#### Solution 3: Check Repository Name
If your repository is named `username.github.io`, it will be available at:
- `https://username.github.io/`

If your repository has a different name, it will be at:
- `https://username.github.io/repository-name/`

In this case, you may need to update paths to include the repository name.

### Local Testing

To test locally before deploying:

```bash
# Option 1: Python (if installed)
python3 -m http.server 8000
# Then open: http://localhost:8000

# Option 2: Node.js (if installed)
npx http-server
# Then open: http://localhost:8080
```

### File Structure Should Be:
```
Website/
├── index.html
├── about.html
├── services.html
├── insurance.html
├── reviews.html
├── service-construction.html
├── service-screening.html
├── service-refurbishing.html
├── styles.css
└── public/
    ├── Logo White No Background .png
    ├── Photo 1.jpeg
    └── ... (other images)
```

### If Images Still Don't Load

If images show 404 errors:
1. Check that the `public` folder is committed to GitHub
2. Verify image filenames match exactly (case-sensitive)
3. Check browser console for specific 404 errors
