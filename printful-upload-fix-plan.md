# Printful Upload Fix Plan

## Problem Identified

The `uploadToPrintful.js` script is not uploading new products to the Printful store during non-dry runs because it's defaulting to template-only mode, even when not explicitly requested.

## Root Cause

In the `getVariantIds()` function (lines 672-712), if there's an error fetching variant IDs, it sets `global.TEMPLATE_ONLY = true` (line 707) and returns an empty object:

```javascript
// Inside getVariantIds() error handler
global.TEMPLATE_ONLY = true;
return {};
```

The `main()` function calls `getVariantIds()` on line 802:

```javascript
VARIANT_IDS = await getVariantIds();
```

However, it never checks if `VARIANT_IDS` is empty or valid before proceeding. This means that any error in fetching variant IDs will silently switch the script to template-only mode without clear notification.

## Solution

### 1. Modify the `getVariantIds()` function

Remove the global state change from the error handler:

```javascript
// BEFORE
catch (error) {
  console.error(`❌ Error getting variant IDs:`, error.message);
  console.log(`⚠️ Warning: Unable to fetch variant IDs for product ID ${GILDAN_18000_PRODUCT_ID}`);
  console.log(`⚠️ This may be because the product ID is incorrect or the API is unavailable.`);
  console.log(`⚠️ Continuing with template-only mode. You can manually create products in Printful.`);
  
  // Force template-only mode to prevent sync attempts with invalid variant IDs
  global.TEMPLATE_ONLY = true;
  
  // Return an empty object to prevent errors
  return {};
}

// AFTER
catch (error) {
  console.error(`❌ Error getting variant IDs:`, error.message);
  console.log(`⚠️ Warning: Unable to fetch variant IDs for product ID ${GILDAN_18000_PRODUCT_ID}`);
  console.log(`⚠️ This may be because the product ID is incorrect or the API is unavailable.`);
  
  // Return an empty object to prevent errors, but let the main script decide what to do
  return {};
}
```

### 2. Add a check in the `main()` function

After calling `getVariantIds()`, check if the result is empty and only then set `TEMPLATE_ONLY = true`:

```javascript
// BEFORE
if (!isDryRun) {
  VARIANT_IDS = await getVariantIds();
}

// AFTER
if (!isDryRun) {
  VARIANT_IDS = await getVariantIds();
  
  // Check if variant IDs were successfully retrieved
  if (Object.keys(VARIANT_IDS).length === 0) {
    console.warn('⚠️ No valid variant IDs returned — switching to template-only mode.');
    global.TEMPLATE_ONLY = true;
  }
}
```

### 3. Add verbose logging (optional enhancement)

Add a log in `processFile()` to clearly indicate when syncing is skipped due to template-only mode:

```javascript
// Inside processFile() function, around line 618
if (TEMPLATE_ONLY) {
  console.log(`⚠️ Template-only mode: Skipping product sync for ${word}`);
  return { templateInfo, word };
}
```

## Implementation Steps

1. Switch to Code mode to edit the JavaScript file
2. Make the changes to `getVariantIds()` function (remove the global state change)
3. Add the check in the `main()` function after calling `getVariantIds()`
4. Optionally enhance the logging in `processFile()`
5. Test the changes by running the script

## Expected Outcome

After these changes:
1. The script will only switch to template-only mode if explicitly requested by the user or if there's a valid reason (like empty variant IDs)
2. There will be clear logging when switching to template-only mode due to missing variant IDs
3. Products will be properly uploaded to Printful when running in non-dry-run mode with valid variant IDs