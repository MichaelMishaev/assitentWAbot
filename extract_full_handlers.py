#!/usr/bin/env python3
"""
Extract state handler methods and append to StateRouter.ts
"""
import re

# Read the MessageRouter.ts file
with open('src/services/MessageRouter.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Read handler info
handlers_to_extract = []
with open('handler_info.txt', 'r') as f:
    for line in f:
        if line.strip():
            name, start, end = line.strip().split(':')
            # Skip handleStateMessage as it's already in StateRouter
            if name != 'handleStateMessage':
                handlers_to_extract.append({
                    'name': name,
                    'start': int(start),
                    'end': int(end)
                })

# Extract all handlers
extracted_code = []
for handler in handlers_to_extract:
    start = handler['start']
    end = handler['end']
    handler_lines = lines[start:end+1]
    extracted_code.extend(handler_lines)
    extracted_code.append('\n')  # Add spacing between handlers

# Read current StateRouter.ts
with open('src/routing/StateRouter.ts', 'r', encoding='utf-8') as f:
    state_router_content = f.read()

# Remove the placeholder comment at the end
state_router_content = state_router_content.replace(
    '''  // Placeholder - will be filled with actual handler implementations
  // This is just the structure, the actual implementations will be extracted from MessageRouter.ts
}''',
    ''
)

# Append all extracted handlers
with open('src/routing/StateRouter.ts', 'w', encoding='utf-8') as f:
    f.write(state_router_content)
    f.write('\n  // ========== EVENT HANDLERS - FULL IMPLEMENTATION ==========\n\n')
    f.write(''.join(extracted_code))
    f.write('}\n')

print(f"Extracted {len(handlers_to_extract)} handlers to StateRouter.ts")
print("Handlers extracted:")
for h in handlers_to_extract:
    print(f"  - {h['name']}")
