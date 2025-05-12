# Product Creation Workflow

## Updated System Architecture

```mermaid
graph TD
    A[uploadToPrintful.js] --> B[Read PNG files from export/ directory]
    B --> C[Generate listing content using OpenRouter]
    C --> D[Upload PNG to Printful]
    D --> E[Create product template]
    E --> F[Create sync product with Etsy integration]
    F --> G[Set Etsy listing to draft]
    
    %% CLI Options branches
    H[CLI Options] --> I[--dry-run]
    H --> J[--template-only]
    H --> K[--sync-only]
    H --> L[--limit=N]
    
    I -.-> |Skip API calls| A
    J -.-> |Skip sync product creation| E
    K -.-> |Skip template creation| F
    L -.-> |Limit number of files| B
```

## Product Template Creation Process

```mermaid
sequenceDiagram
    participant Script as uploadToPrintful.js
    participant Printful as Printful API
    participant Etsy as Etsy via Printful
    
    Script->>Printful: Upload design file
    Printful-->>Script: Return file URL
    
    Script->>Printful: Create product template
    Note right of Script: POST /product-templates
    Printful-->>Script: Return template ID
    
    Script->>Printful: Create sync product
    Note right of Script: POST /store/products
    Note right of Script: Include template_id
    Printful-->>Script: Return product ID
    
    Printful->>Etsy: Create draft listing
    Note right of Printful: Include GPT-generated content
    Etsy-->>Printful: Return listing ID
    
    Printful-->>Script: Return success
```

## Error Handling Strategy

```mermaid
flowchart TD
    A[Start Process] --> B{Template Creation}
    B -->|Success| C[Store Template ID]
    B -->|Failure| D{Template Only Mode?}
    
    D -->|Yes| E[Fail Process]
    D -->|No| F[Log Warning]
    F --> G[Continue Without Template]
    
    C --> H{Sync Only Mode?}
    G --> H
    
    H -->|Yes| I[Skip Template Creation]
    H -->|No| J{Template Only Mode?}
    
    I --> K[Create Sync Product]
    J -->|Yes| L[End Process Successfully]
    J -->|No| K
    
    K -->|Success| M[End Process Successfully]
    K -->|Failure| N[Log Error]
    N --> O[Continue to Next File]
```

## Implementation Sequence

```mermaid
gantt
    title Product Creation Implementation Sequence
    dateFormat  YYYY-MM-DD
    section Environment Setup
    Update .env file            :a1, 2025-05-11, 1d
    section Code Implementation
    Add createProductTemplate function    :a2, after a1, 1d
    Update createProductWithEtsySync      :a3, after a2, 1d
    Modify processFile flow              :a4, after a3, 1d
    Add CLI options                       :a5, after a4, 1d
    section Testing
    Test with single file                 :a6, after a5, 1d
    Fix issues                            :a7, after a6, 1d
    Test with multiple files              :a8, after a7, 1d
    section Documentation
    Update documentation                  :a9, after a8, 1d
```

## Data Flow

```mermaid
flowchart LR
    A[PNG File] --> B[File Upload]
    B --> C[File URL]
    
    C --> D[Product Template]
    C --> E[Sync Product]
    
    D --> |template_id| E
    
    F[GPT Content] --> |title, description, tags| E
    
    E --> G[Etsy Draft Listing]
    
    H[Mockup Files] --> |custom mockups| E
```

## CLI Options Decision Tree

```mermaid
flowchart TD
    A[Start Script] --> B{--dry-run?}
    B -->|Yes| C[Skip API Calls]
    B -->|No| D{--template-only?}
    
    D -->|Yes| E[Create Templates Only]
    D -->|No| F{--sync-only?}
    
    F -->|Yes| G[Create Sync Products Only]
    F -->|No| H[Full Process]
    
    I{--limit=N?} -->|Yes| J[Process N Files]
    I -->|No| K[Process All Files]
    
    C --> I
    E --> I
    G --> I
    H --> I