#!/bin/bash

# Image optimization script for GitHub
# This script compresses images in the public folder to reduce file size

cd "$(dirname "$0")"

echo "Starting image optimization..."
echo ""

# Create optimized directory if it doesn't exist
mkdir -p public_optimized

# Counter
count=0
total_size_before=0
total_size_after=0

# Process all images
for img in public/*.{jpg,jpeg,JPG,JPEG,png,PNG} 2>/dev/null; do
    if [ -f "$img" ]; then
        filename=$(basename "$img")
        output="public_optimized/$filename"
        
        # Get original size
        size_before=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
        total_size_before=$((total_size_before + size_before))
        
        # Optimize using sips (macOS built-in)
        if command -v sips &> /dev/null; then
            # Convert to JPEG with quality 85% for photos, or optimize PNG
            if [[ "$img" == *.png ]] || [[ "$img" == *.PNG ]]; then
                # For PNG, try to optimize or convert to JPEG if it's a photo
                sips -s format jpeg -s formatOptions 85 "$img" --out "$output" 2>/dev/null || cp "$img" "$output"
            else
                # For JPEG, re-encode with quality 85%
                sips -s format jpeg -s formatOptions 85 "$img" --out "$output" 2>/dev/null || cp "$img" "$output"
            fi
            
            # Get optimized size
            if [ -f "$output" ]; then
                size_after=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
                total_size_after=$((total_size_after + size_after))
                count=$((count + 1))
                
                # Calculate savings
                savings=$((size_before - size_after))
                percent=$((savings * 100 / size_before))
                
                echo "✓ Optimized: $filename ($(numfmt --to=iec-i --suffix=B $size_before 2>/dev/null || echo "${size_before}") → $(numfmt --to=iec-i --suffix=B $size_after 2>/dev/null || echo "${size_after}") - ${percent}% smaller)"
            fi
        else
            # Fallback: just copy if sips not available
            cp "$img" "$output"
        fi
    fi
done

echo ""
echo "Optimization complete!"
echo "Processed: $count images"
echo ""

# Show size comparison
if [ $total_size_before -gt 0 ]; then
    total_savings=$((total_size_before - total_size_after))
    percent_savings=$((total_savings * 100 / total_size_before))
    
    echo "Total size before: $(numfmt --to=iec-i --suffix=B $total_size_before 2>/dev/null || echo "${total_size_before} bytes")"
    echo "Total size after:  $(numfmt --to=iec-i --suffix=B $total_size_after 2>/dev/null || echo "${total_size_after} bytes")"
    echo "Total savings:     $(numfmt --to=iec-i --suffix=B $total_savings 2>/dev/null || echo "${total_savings} bytes") (${percent_savings}%)"
    echo ""
    echo "Optimized images are in: public_optimized/"
    echo ""
    echo "To replace original images, run:"
    echo "  mv public_optimized/* public/"
    echo "  rmdir public_optimized"
fi
