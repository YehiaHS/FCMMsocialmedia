#!/usr/bin/env python3
"""Download all Google Drive media and compress for GitHub Pages."""
import subprocess, os, sys

MEDIA_DIR = os.path.join(os.path.dirname(__file__), 'media')
os.makedirs(MEDIA_DIR, exist_ok=True)

# file_id -> (output_name, type)
FILES = {
    # Slide 3 — Open Day Video
    '1aDTgSMVa4sIHafWpOXiH9twYbNGQvIjV': ('open_day', 'video'),
    # Slide 4 — TikTok Reels
    '1bktJfcnmwa3DzTa1H_mms-kLUO-tcgvc': ('reel1', 'video'),
    '1CCvfNANWs_7nf4Vz_J9i3NOuBm8YuKgx': ('reel2', 'video'),
    '1PR3YlaiSj1QXf5MoVFrOR_9fvlJBROfe': ('reel3', 'video'),
    '1gBFGKlo2xfIrfgW37E6KHKJl4mL2zJ5K': ('reel4', 'video'),
    # Slide 5 — Static Posts (images)
    '14XRobnoJ_oNYxN2hIySCwd83zxwHB6ys': ('post1', 'image'),
    '1qXptkNgy0IH4bo9CB35Rc1-Yxhafl6Lg': ('post2', 'image'),
    '1C7aq_Kuf05keENfVslsliE_VLX3_Frkk': ('post3', 'image'),
}

def download(file_id, name, ftype):
    """Download from Google Drive using gdown."""
    ext = '.mp4' if ftype == 'video' else '.jpg'
    raw_path = os.path.join(MEDIA_DIR, f'{name}_raw{ext}')
    final_path = os.path.join(MEDIA_DIR, f'{name}{ext}')
    
    if os.path.exists(final_path):
        print(f'  [SKIP] {final_path} already exists')
        return final_path
    
    url = f'https://drive.google.com/uc?id={file_id}'
    print(f'  Downloading {name} ...')
    subprocess.run([
        sys.executable, '-m', 'gdown', url, '-O', raw_path
    ], check=True)
    return raw_path

def compress_video(raw_path, name):
    """Compress video to web-friendly size with ffmpeg."""
    final = os.path.join(MEDIA_DIR, f'{name}.mp4')
    if os.path.exists(final):
        print(f'  [SKIP] {final} already compressed')
        return
    
    # For reels (vertical short-form): scale to 360px wide, aggressive CRF
    # For open_day (landscape): scale to 720p, moderate CRF
    if 'reel' in name:
        scale = 'scale=360:-2'
        crf = '32'
    else:
        scale = 'scale=-2:480'
        crf = '30'
    
    print(f'  Compressing {name} ...')
    subprocess.run([
        'ffmpeg', '-y', '-i', raw_path,
        '-vf', scale,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
        '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        final
    ], check=True)
    os.remove(raw_path)
    size_mb = os.path.getsize(final) / (1024*1024)
    print(f'  -> {final} ({size_mb:.1f} MB)')

def compress_image(raw_path, name):
    """Compress image with ffmpeg (convert to optimized JPEG)."""
    final = os.path.join(MEDIA_DIR, f'{name}.jpg')
    if os.path.exists(final) and raw_path == final:
        print(f'  [SKIP] {final} already exists')
        return
    
    print(f'  Compressing {name} ...')
    subprocess.run([
        'ffmpeg', '-y', '-i', raw_path,
        '-q:v', '3',
        final
    ], check=True)
    if raw_path != final and os.path.exists(raw_path):
        os.remove(raw_path)
    size_kb = os.path.getsize(final) / 1024
    print(f'  -> {final} ({size_kb:.0f} KB)')

for fid, (name, ftype) in FILES.items():
    print(f'\n=== {name} ({ftype}) ===')
    raw = download(fid, name, ftype)
    if ftype == 'video':
        compress_video(raw, name)
    else:
        compress_image(raw, name)

print('\n✅ All media downloaded and compressed!')
print('Files:')
for f in sorted(os.listdir(MEDIA_DIR)):
    size = os.path.getsize(os.path.join(MEDIA_DIR, f))
    print(f'  {f}  ({size/1024:.0f} KB)')
