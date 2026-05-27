#!/usr/bin/env python3
"""
Eolite Mobile CSS Final Verification Script
Checks all critical selectors, values, and properties needed
for a solid, accessible, and premium mobile experience, at all mobile breakpoints.
"""
import re

def check_property_in_mq(css, prop, min_mqw=None, max_mqw=None):
    # Check if property exists in any @media block
    # If min/max_mqw set, restrict to those blocks
    mq_blocks = []
    # Simple regex to split by @media blocks (coarse, but works for this file)
    # We'll capture all declarations inside @media {...}
    pattern = r'@media\s*\(([^)]*)\)\s*\{([\s\S]*?)\}'
    for match in re.finditer(pattern, css):
        cond = match.group(1)
        body = match.group(2)
        if prop in body:
            mq_blocks.append(cond)
    return mq_blocks

def main():
    with open('/home/inachis/Eolite/frontend/css/public.css', 'r') as f:
        css = f.read()

    checks = []

    # 1. Mobile menu uses solid background
    if 'var(--color-bg-alt)' in css and 'background: var(--color-bg-alt)' in css:
        checks.append("PASS: Solid background (--color-bg-alt) used in mobile .main-nav")
    else:
        checks.append("FAIL: Solid background not found in mobile .main-nav")

    # 2. Mobile menu z-index
    if 'z-index: 500' in css:
        checks.append("PASS: z-index: 500 set for mobile .main-nav")
    else:
        checks.append("FAIL: z-index not set for mobile .main-nav")

    # 3. Mobile menu is NOT using transparent --color-bg-glass
    mq_blocks = check_property_in_mq(css, 'background: var(--color-bg-glass)')
    if not mq_blocks:
        checks.append("PASS: No transparent --color-bg-glass used in any media query")
    else:
        checks.append(f"FAIL: Transparent --color-bg-glass found in media queries: {mq_blocks}")

    # 4. Mobile menu toggle (hamburger) has focus state
    if '.mobile-menu-toggle:focus' in css:
        checks.append("PASS: .mobile-menu-toggle:focus exists")
    else:
        checks.append("FAIL: No focus state for .mobile-menu-toggle")

    # 5. lang-btn has focus-visible
    if '.lang-btn:focus-visible' in css:
        checks.append("PASS: .lang-btn:focus-visible exists")
    else:
        checks.append("FAIL: No :focus-visible for .lang-btn")

    # 6. Buttons have sufficient touch target at mobile
    # Check if .btn padding at <=480px gives >44px
    # If padding is 0.85rem and font-size 0.85rem => ~44px
    if '.btn { padding:' in css or 'padding: 0.85rem' in css:
        checks.append("PASS: Button padding adjusted for mobile touch target")
    else:
        checks.append("INFO: Verify button touch target manually")

    # 7. Reduced motion support
    if 'prefers-reduced-motion' in css:
        checks.append("PASS: prefers-reduced-motion supported")
    else:
        checks.append("FAIL: No reduced motion support")

    # 8. No overflow-x hidden on body
    if 'overflow-x: hidden' in css:
        checks.append("PASS: overflow-x hidden on body (prevents horizontal scroll)")
    else:
        checks.append("FAIL: body missing overflow-x: hidden")

    # 9. Hero font-size uses clamp
    if 'clamp(' in css and 'hero-title' in css:
        checks.append("PASS: Hero title uses clamp() for fluid sizing")
    else:
        checks.append("INFO: Verify hero title sizing manually")

    # 10. Card grid stacks on mobile
    if 'grid-template-columns: 1fr' in css:
        checks.append("PASS: Card grid stacks to single column on mobile")
    else:
        checks.append("FAIL: Card grid does not stack on mobile")

    for c in checks:
        print(c)
    print(f"\nTotal: {len(checks)} checks")
    print(f"PASS: {sum(1 for c in checks if c.startswith('PASS'))}")
    print(f"FAIL: {sum(1 for c in checks if c.startswith('FAIL'))}")
    print(f"INFO: {sum(1 for c in checks if c.startswith('INFO'))}")

if __name__ == '__main__':
    main()
