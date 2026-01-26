#!/usr/bin/env python3
"""
Image optimization script to reduce file sizes for GitHub
"""
import os
import subprocess
import sys

def optimize_image(input_path, quality=75):
    """Optimize a single image using sips (macOS)"""
    try:
        # Get original size
        orig_size = os.path.getsize(input_path)
        
        # Create temp output
        temp_output = input_path + "_temp.jpg"
        
        # Use sips to optimize
        result = subprocess.run(
            ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', str(quality), 
             input_path, '--out', temp_output],
            capture_output=True,
            text=True
        )
        
        if os.path.exists(temp_output):
            new_size = os.path.getsize(temp_output)
            
            # Only replace if smaller
            if new_size < orig_size:
                os.replace(temp_output, input_path)
                savings = orig_size - new_size
                percent = (savings / orig_size) * 100
                print(f"✓ {os.path.basename(input_path)}: {orig_size/1024:.1f}KB → {new_size/1024:.1f}KB ({percent:.1f}% smaller)")
                return savings
            else:
                os.remove(temp_output)
                print(f"  {os.path.basename(input_path)}: Already optimized")
        return 0
    except Exception as e:
        print(f"✗ Error optimizing {input_path}: {e}")
        return 0

def main():
    public_dir = "public"
    if not os.path.exists(public_dir):
        print(f"Error: {public_dir} directory not found")
        sys.exit(1)
    
    print("Optimizing images in public folder...")
    print("=" * 50)
    
    total_savings = 0
    count = 0
    
    # Process all image files
    for filename in os.listdir(public_dir):
        filepath = os.path.join(public_dir, filename)
        
        if os.path.isfile(filepath):
            ext = filename.lower().split('.')[-1]
            if ext in ['jpg', 'jpeg', 'png', 'gif']:
                savings = optimize_image(filepath)
                total_savings += savings
                count += 1
    
    print("=" * 50)
    print(f"\nOptimized {count} images")
    print(f"Total space saved: {total_savings/1024/1024:.2f} MB")
    print("\nDone! Your images are now optimized for GitHub.")

if __name__ == "__main__":
    main()
