# Snippets Directory

This directory contains the source JavaScript files for all web performance measurement snippets, organized by category.

## Structure

```
snippets/
├── CoreWebVitals/        # LCP, CLS, INP metrics
│   ├── *.js             # Snippet source files
│   └── WORKFLOWS.md     # Optional workflows & decision trees (if applicable)
├── Loading/              # TTFB, FCP, scripts, fonts, resource hints
│   ├── *.js
│   └── WORKFLOWS.md     # Workflows & decision trees for loading optimization
├── Interaction/          # Long tasks, animation frames, scroll performance
│   ├── *.js
│   └── WORKFLOWS.md     # Optional workflows & decision trees (if applicable)
├── Media/                # Images, videos, SVGs
│   ├── *.js
│   └── WORKFLOWS.md     # Optional workflows & decision trees (if applicable)
└── Resources/            # Network bandwidth, connection quality
    ├── *.js
    └── WORKFLOWS.md     # Optional workflows & decision trees (if applicable)
```

## Adding Workflows & Decision Trees

To add intelligent workflows and decision trees to a skill category:

1. **Create `WORKFLOWS.md`** in the category directory (e.g., `snippets/Loading/WORKFLOWS.md`)

2. **Structure the file** with two main sections:

   ```markdown
   ## Common Workflows

   ### Workflow Name

   When the user asks about [scenario]:

   1. **Snippet1.js** - Brief description
   2. **Snippet2.js** - Brief description

   ## Decision Tree

   Use this decision tree to automatically run follow-up snippets based on results:

   ### After Snippet1.js

   - **If condition** → Run **Snippet2.js**
   - **If other condition** → Run **Snippet3.js**
   ```

3. **Run the generator** to inject workflows into skills:

   ```bash
   node scripts/generate-skills.js
   ```

   The generator will:
   - Read `WORKFLOWS.md` from each category
   - Inject the content into the generated `SKILL.md`
   - Copy to both `/skills/` (for distribution) and `/.claude/skills/` (for local use)

## Example: Loading Workflows

See `snippets/Loading/WORKFLOWS.md` for a complete example with:

- 8 common workflow scenarios (Complete Audit, Server Investigation, Font Optimization, etc.)
- 16 decision trees with conditional logic for follow-up snippets
- Threshold-based triggers (e.g., "If TTFB > 600ms, run TTFB-Sub-Parts.js")

## Benefits

**For agents:**
- Autonomous multi-snippet execution based on results
- Context-aware snippet selection
- Progressive diagnostic workflows

**For maintainability:**
- Workflows persist across regenerations
- Single source of truth in `snippets/` directory
- Version-controlled expertise and best practices

## Build System

The `generate-skills.js` script:

1. Reads all `.js` files from each category
2. Extracts metadata from corresponding MDX documentation in `/pages/`
3. Injects `WORKFLOWS.md` content (if exists)
4. Generates complete `SKILL.md` files with:
   - Snippet table
   - Execution instructions
   - Workflows & decision trees
   - Individual snippet documentation with thresholds

**Note:** Never edit generated files directly. Always modify source files in `/snippets/` and regenerate.
