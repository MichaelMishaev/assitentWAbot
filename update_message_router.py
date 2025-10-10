#!/usr/bin/env python3
"""
Update MessageRouter.ts to use StateRouter
"""

# Read handler info to know which lines to remove
handlers_to_remove = []
with open('handler_info.txt', 'r') as f:
    for line in f:
        if line.strip():
            name, start, end = line.strip().split(':')
            # Remove all handlers except handleStateMessage
            if name != 'handleStateMessage':
                handlers_to_remove.append({
                    'name': name,
                    'start': int(start),
                    'end': int(end)
                })

# Read MessageRouter.ts
with open('src/services/MessageRouter.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Mark lines to remove
lines_to_remove = set()
for handler in handlers_to_remove:
    for i in range(handler['start'], handler['end'] + 1):
        lines_to_remove.add(i)

# Keep only non-removed lines
new_lines = []
for i, line in enumerate(lines):
    if i not in lines_to_remove:
        new_lines.append(line)

# Now update the content:
# 1. Add StateRouter import after NLPRouter import
# 2. Add stateRouter field
# 3. Initialize stateRouter in constructor
# 4. Replace handleStateMessage implementation with delegation

content = ''.join(new_lines)

# 1. Add import
content = content.replace(
    "import { NLPRouter } from '../routing/NLPRouter.js';",
    "import { NLPRouter } from '../routing/NLPRouter.js';\nimport { StateRouter } from '../routing/StateRouter.js';"
)

# 2. Add field declaration (after nlpRouter field)
content = content.replace(
    "  private nlpRouter: NLPRouter;",
    "  private nlpRouter: NLPRouter;\n  private stateRouter: StateRouter;"
)

# 3. Initialize stateRouter in constructor (after nlpRouter initialization)
# Find the section after nlpRouter initialization
nlp_router_init = """    // Set callback for showing menu after authentication"""
state_router_init = """    // Initialize StateRouter with required dependencies
    this.stateRouter = new StateRouter(
      stateManager,
      eventService,
      reminderService,
      taskService,
      settingsService,
      this.commandRouter,
      this.sendMessage.bind(this),
      this.reactToLastMessage.bind(this)
    );

    // Set callback for showing menu after authentication"""

content = content.replace(nlp_router_init, state_router_init)

# 4. Replace handleStateMessage implementation with delegation
# Find and replace the handleStateMessage method body
import re

# The handleStateMessage method should now just delegate to stateRouter
# We need to find it and replace its body
old_handle_state = r'  private async handleStateMessage\(\s*phone: string,\s*userId: string,\s*state: ConversationState,\s*text: string\s*\): Promise<void> \{[^}]*switch \(state\) \{.*?\n  \}'

new_handle_state = '''  private async handleStateMessage(
    phone: string,
    userId: string,
    state: ConversationState,
    text: string
  ): Promise<void> {
    // Handle MAIN_MENU state here (not delegated to StateRouter)
    if (state === ConversationState.IDLE || state === ConversationState.MAIN_MENU) {
      await this.handleMainMenuChoice(phone, userId, text);
      return;
    }

    // Delegate all other states to StateRouter
    await this.stateRouter.handleStateMessage(phone, userId, state, text);
  }'''

content = re.sub(old_handle_state, new_handle_state, content, flags=re.DOTALL)

# Write updated content
with open('src/services/MessageRouter.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("MessageRouter.ts updated successfully!")
print(f"Removed {len(handlers_to_remove)} handler methods")
print("Added StateRouter import and initialization")
print("Updated handleStateMessage to delegate to StateRouter")
