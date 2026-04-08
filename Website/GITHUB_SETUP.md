# GitHub Setup Instructions

## ✅ Step 1: Repository Initialized
Your local git repository has been initialized and your first commit has been created.

## 📤 Step 2: Create Repository on GitHub

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **+** icon in the top right → **New repository**
3. Name your repository (e.g., `screen-armors-website` or `website`)
4. **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click **Create repository**

## 🔗 Step 3: Connect and Push

After creating the repository on GitHub, you'll see instructions. Run these commands in your terminal:

```bash
cd "/Users/benmather/Website "

# Add your GitHub repository as remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Push your code
git push -u origin main
```

**Example:**
If your GitHub username is `benmather` and repository is `screen-armors-website`:
```bash
git remote add origin https://github.com/benmather/screen-armors-website.git
git push -u origin main
```

## 🌐 Step 4: Enable GitHub Pages

Once your code is pushed:

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Scroll down to **Pages** (left sidebar)
4. Under **Source**, select:
   - Branch: **main**
   - Folder: **/ (root)**
5. Click **Save**

## 🎉 Step 5: Access Your Website

After a few minutes, your website will be available at:
- `https://YOUR_USERNAME.github.io/REPO_NAME/`

Or if you named your repository `YOUR_USERNAME.github.io`:
- `https://YOUR_USERNAME.github.io/`

## ⚠️ Important Notes

- **First deployment takes 5-10 minutes** - be patient!
- If your repo name is NOT `username.github.io`, your site URL will include the repo name
- Make sure all files are committed and pushed
- The `public` folder with images must be included in the repository

## 🔍 Troubleshooting

**If Pages still doesn't show a branch:**
- Make sure you've pushed code to GitHub (Step 3)
- Wait a few minutes and refresh the Pages settings
- Check that your branch is named `main` (not `master`)

**If you get 404 errors:**
- Wait 5-10 minutes after enabling Pages
- Check that all files are in the repository
- Verify the repository name matches your URL
