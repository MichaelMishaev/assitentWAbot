#!/usr/bin/env python3
"""
Extract state handler methods from MessageRouter.ts
"""
import re

# Read the MessageRouter.ts file
with open('src/services/MessageRouter.ts', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

# Find all state handler methods
handlers = []
current_method = None
brace_count = 0
in_method = False

for i, line in enumerate(lines):
    # Check if this is a state handler method declaration
    if re.match(r'  private async (handleEvent|handleReminder|handleTask|handleSettings|handleState|handleAdding|handleListing|handleMarking|handleDeleting|handleUpdating|handleBulk)', line):
        current_method = {
            'name': re.search(r'private async (\w+)\(', line).group(1),
            'start': i,
            'lines': [line],
            'full_text': ''
        }
        in_method = True
        # Count braces in this line
        brace_count = line.count('{') - line.count('}')
        continue

    if in_method and current_method:
        current_method['lines'].append(line)
        brace_count += line.count('{') - line.count('}')

        # If we've closed all braces, the method is complete
        if brace_count == 0 and '{' in ''.join(current_method['lines']):
            current_method['end'] = i
            current_method['full_text'] = '\n'.join(current_method['lines'])
            handlers.append(current_method)
            current_method = None
            in_method = False
            brace_count = 0

print(f"Found {len(handlers)} state handlers:")
for h in handlers:
    print(f"  - {h['name']}: lines {h['start']}-{h['end']}")

# Save handler names and line ranges to a file
with open('handler_info.txt', 'w') as f:
    for h in handlers:
        f.write(f"{h['name']}:{h['start']}:{h['end']}\n")

print(f"\nHandler info saved to handler_info.txt")
