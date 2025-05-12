# Plan: Make `uploadToPrintful.js` Attempt Sync by Default

## Current Behavior

Currently, the script defaults to template-only mode (no syncing) unless the `--attempt-sync` flag is explicitly provided. This is controlled by line 35:

```javascript
const TEMPLATE_ONLY = !args.includes('--attempt-sync'); // Default to template-only mode
```

## Required Changes

### 1. Change the Default Behavior

The primary change is to invert the default behavior by modifying line 35:

```javascript
// FROM:
const TEMPLATE_ONLY = !args.includes('--attempt-sync'); // Default to template-only mode

// TO:
const TEMPLATE_ONLY = args.includes('--template-only'); // Default to syncing unless explicitly overridden
```

### 2. Update Help Text

The help text should be updated to reflect the new default behavior:

```javascript
// FROM:
Options:
  --dry-run, -d         Run in dry-run mode (no actual API calls)
  --limit=N, -l=N       Process only N files
  --attempt-sync        Try to sync products (may fail with platform-based stores)
  --sync-only, -s       Skip template creation and only sync products
  --help, -h            Show this help text

Examples:
  node uploadToPrintful.js                   # Create templates for all files
  node uploadToPrintful.js --limit=1         # Process only one file
  node uploadToPrintful.js --dry-run         # Test without making API calls
  node uploadToPrintful.js --attempt-sync    # Try to create templates and sync products

// TO:
Options:
  --dry-run, -d         Run in dry-run mode (no actual API calls)
  --limit=N, -l=N       Process only N files
  --template-only       Skip product syncing (create templates only)
  --sync-only, -s       Skip template creation and only sync products
  --help, -h            Show this help text

Examples:
  node uploadToPrintful.js                   # Create templates and sync products
  node uploadToPrintful.js --limit=1         # Process only one file
  node uploadToPrintful.js --dry-run         # Test without making API calls
  node uploadToPrintful.js --template-only   # Create templates only (no syncing)
```

### 3. Add Backward Compatibility Note (Optional)

For backward compatibility, we could add a note when the `--attempt-sync` flag is used:

```javascript
// Add this after line 36 (after TEMPLATE_ONLY and SYNC_ONLY definitions)
if (args.includes('--attempt-sync')) {
  console.log('⚠️ Note: --attempt-sync is now the default behavior and no longer needed');
}
```

## Expected Behavior After Changes

- Running `node uploadToPrintful.js` will attempt sync by default
- Running `node uploadToPrintful.js --template-only` will skip sync
- Running `node uploadToPrintful.js --dry-run` will still run in dry-run mode
- Running `node uploadToPrintful.js --sync-only` will still skip template generation and go straight to syncing

## Implementation Steps

1. Switch to Code mode to edit the JavaScript file
2. Change line 35 to make syncing the default behavior
3. Update the help text to reflect the new default behavior
4. Add a backward compatibility note for the `--attempt-sync` flag (optional)
5. Test the changes to ensure they work as expected