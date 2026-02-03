

# Fix Plan: Menu Position and Username Detection

## Summary
This plan addresses two issues with the Chrome Extension:
1. The "Movies in common" button should be positioned as the 11th menu item (after "Network")
2. The logged-in username detection is failing because the current selectors don't match Letterboxd's actual DOM structure

---

## Technical Changes

### 1. Fix Menu Item Position (After "Network")

**Current behavior:** The menu item is appended at the end of the navigation list.

**Solution:** Instead of appending, find the "Network" menu item and insert after it, or insert at position 11 (index 10).

```text
┌─────────────────────────────────────┐
│ Profile Navigation Menu             │
├─────────────────────────────────────┤
│ 1. Profile                          │
│ 2. Activity                         │
│ 3. Films                            │
│ 4. Diary                            │
│ 5. Reviews                          │
│ 6. Watchlist                        │
│ 7. Lists                            │
│ 8. Likes                            │
│ 9. Tags                             │
│ 10. Network                         │
│ 11. Movies in common  ← NEW         │
│ ...                                 │
└─────────────────────────────────────┘
```

**Implementation:**
- Find the nav list items
- Look for the "Network" link and insert after it
- Fallback: insert at index 10 if "Network" not found
- Final fallback: append to end

---

### 2. Fix Logged-in Username Detection

**Current issue:** The selector `.avatar.-a24` is not finding the logged-in user's avatar.

**Solution:** Update `getLoggedInUsername()` with multiple fallback strategies:

1. **Primary:** Look for the user's avatar in the header/navigation area using class patterns like `.avatar`, `[data-person]`, or navigation links
2. **Secondary:** Check the "You" or profile link in the main navigation
3. **Tertiary:** Look for the username in meta tags or data attributes on the page
4. **Quaternary:** Check cookies or local storage (if accessible)

**New selectors to try:**
- `nav .avatar[alt]` - Avatar in navigation
- `a[href^="/"][data-person]` - Profile link with data attribute  
- `.main-nav a[href^="/"]` - Links in main nav
- Look for pattern: user's profile link often appears multiple times on the page

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/extension/content.js` | Update `injectMenuItem()` to insert after "Network" at position 11. Update `getLoggedInUsername()` with better selectors and fallbacks. |

---

## Detailed Code Changes

### In `injectMenuItem()` function (around line 502-526):
- After creating the menu item, find the "Network" link by text content
- Use `insertBefore()` to place the new item after Network
- Handle edge cases where Network doesn't exist

### In `getLoggedInUsername()` function (around line 29-42):
- Add multiple selector attempts in order of reliability
- Try selectors commonly used by Letterboxd:
  - Header profile dropdown link
  - Avatar with username in alt text
  - Profile menu link
  - Account menu items
- Add console logging for debugging
- Return the first successful match

---

## Testing Considerations
After implementation, the extension should be tested on:
- A profile page when logged in
- Different profile pages (not your own)
- Ensure the menu item appears in the correct position
- Verify clicking it successfully detects both usernames

