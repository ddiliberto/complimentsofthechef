# Cloudinary Migration Guide

This guide explains how to migrate from Dropbox to Cloudinary as the primary file hosting solution for your Printful integration.

## Why Migrate to Cloudinary?

- **Simplified Authentication**: No more complex OAuth token management
- **Better Performance**: Faster uploads and downloads
- **More Reliable**: Direct integration without multiple API calls
- **Future-Proof**: Cloudinary offers many additional features for future enhancements

## Setup Instructions

### 1. Update Your .env File

Add the following Cloudinary credentials to your `.env` file:

```
CLOUDINARY_CLOUD_NAME=dw7k1nob9
CLOUDINARY_API_KEY=122433767661295
CLOUDINARY_API_SECRET=J2_BLqLM8WNAio6KG_RVomSbkW8
```

### 2. Test the Integration

Run the test script to verify that Cloudinary is working correctly:

```bash
node testCloudinaryUpload.js
```

This script will:
- Check if your Cloudinary credentials are properly configured
- Find a test image in your export directory
- Upload it to Cloudinary using both direct and file uploader methods
- Verify that the URLs are returned correctly

### 3. Use the New Upload Process

The migration is designed to be seamless. Your existing code that uses `uploadFileWithFallbackStrategy` will continue to work, but now it will use Cloudinary instead of Dropbox.

When running `uploadToPrintful.js`, you no longer need to use the `--direct-upload` flag, as all uploads now go directly to Cloudinary.

```bash
# Old way (no longer needed)
node uploadToPrintful.js --direct-upload --limit=1

# New way
node uploadToPrintful.js --limit=1
```

## What Changed?

1. **New Files**:
   - `cloudinaryUploader.js`: Handles direct uploads to Cloudinary
   - `testCloudinaryUpload.js`: Tests the Cloudinary integration
   - `updateEnv.js`: Updates the .env file with Cloudinary credentials

2. **Updated Files**:
   - `fileUploader.js`: Now uses Cloudinary instead of Dropbox
   - `uploadToPrintful.js`: Removed Dropbox references and simplified command line options

3. **Deprecated Features**:
   - The `--direct-upload` flag is no longer needed (all uploads are direct)
   - The `enableDropboxFallback` parameter in `uploadFileWithFallbackStrategy` is kept for backward compatibility but no longer does anything

4. **Bug Fixes**:
   - Fixed an issue with the property name for mockup files (`local_mockup_files` vs `mockup_files`)
   - Removed Dropbox-specific error handling code

## Troubleshooting

If you encounter any issues:

1. **Check your .env file**: Make sure your Cloudinary credentials are correct
2. **Run the test script**: Use `node testCloudinaryUpload.js` to verify your setup
3. **Check Cloudinary dashboard**: Log in to your Cloudinary account to see if files are being uploaded correctly

### Common Issues

#### Product Sync Failures

If you see errors like:
```
❌ Error creating product: Request failed with status code 400
```

This is likely due to Printful API limitations with platform-based stores, not an issue with the Cloudinary integration. As the script mentions:

```
⚠️ No products were synced. This is normal for platform-based stores.
⚠️ To sync products, use the templates created above in the Printful dashboard.
⚠️ You can also create a Manual Order / API platform store in Printful for testing.
```

## Future Enhancements

Potential future improvements:
1. Add image optimization using Cloudinary's transformation features
2. Implement better error handling and retry logic
3. Add caching for frequently accessed images