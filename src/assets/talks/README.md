# Talks Assets Directory

Place your talk PDF files in this directory.

## How It Works

1. Add your PDF slides to this directory
2. Reference them in `/src/data/talks.yaml` with the `slides` field
3. Run `npm run build` to convert PDFs to images
4. The build process will:
   - Copy the original PDF (for download functionality)
   - Convert each PDF page to a PNG image at 150 DPI using ImageMagick
   - Apply white background and remove transparency for consistent rendering
   - Optimize images with 85% quality for smaller file sizes
   - Create a metadata.json file with page count and slide list
   - Store everything in `build/assets/talks/<pdf-name>/`

## Requirements

- The system must have **ImageMagick** installed (provides `convert` command)
- On Ubuntu/Debian: `sudo apt-get install imagemagick`
- On macOS: `brew install imagemagick`
- On Windows: Download from https://imagemagick.org/script/download.php

## Example Files

Current talks PDFs:
- `pycon-us-2024-testing-data-pipelines.pdf` (3 slides)
- `scipy-india-2018-ml-audio.pdf` (2 slides)

## Naming Convention

PDF filenames should match the `slides` field in `talks.yaml`. For example:
- YAML: `slides: "assets/talks/my-talk.pdf"`
- File: `src/assets/talks/my-talk.pdf`

The build process extracts images to `build/assets/talks/my-talk/slide-0.png`, `slide-1.png`, etc.
