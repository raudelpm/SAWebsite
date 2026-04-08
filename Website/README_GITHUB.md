# GitHub Upload Instructions

## Image Optimization

Your images are currently too large for GitHub. Here are solutions:

### Option 1: Optimize Images (Recommended)

Run this command in your terminal to optimize all images:

```bash
cd "/Users/benmather/Website "
for file in public/*.{jpg,jpeg,JPG,JPEG,png,PNG}; do
  if [ -f "$file" ]; then
    sips -s format jpeg -s formatOptions 70 "$file" --out "${file%.*}_opt.jpg" 2>/dev/null
    if [ -f "${file%.*}_opt.jpg" ]; then
      orig=$(stat -f%z "$file")
      new=$(stat -f%z "${file%.*}_opt.jpg")
      if [ "$new" -lt "$orig" ]; then
        mv "${file%.*}_opt.jpg" "$file"
        echo "Optimized: $(basename "$file")"
      else
        rm "${file%.*}_opt.jpg"
      fi
    fi
  fi
done
```

### Option 2: Use Git LFS for Large Files

If images are still too large, use Git Large File Storage:

```bash
# Install Git LFS (if not installed)
brew install git-lfs

# Initialize Git LFS
git lfs install

# Track large image files
git lfs track "public/*.jpg"
git lfs track "public/*.jpeg"
git lfs track "public/*.png"

# Add .gitattributes
git add .gitattributes
```

### Option 3: Host Images Externally

Upload images to a CDN or image hosting service and update image paths in your HTML files.

## Current Folder Size

The `public/` folder is currently **58MB**. GitHub recommends keeping repositories under 100MB for optimal performance.
