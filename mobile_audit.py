#!/usr/bin/env python3
"""
Eolite Mobile CSS Audit Script
Scans frontend/css/public.css for common mobile/a11y issues.
Outputs a checklist of potential problems to fix.
"""
import re
import sys

def main():
    css_path = '/home/inachis/Eolite/frontend/css/public.css'
    with open(css_path, 'r') as f:
        css = f.read()

    issues = []

    # 1. Check for horizontal scrolling risks (fixed width > 100vw, overflow-x, etc)
    if 'overflow-x: hidden' not in css:
        issues.append("WARN: No overflow-x: hidden on body — possible horizontal scroll at small widths")
    else:
        issues.append("OK: body has overflow-x: hidden")

    # 2. Check for fixed element z-index and stacking
    z500 = 'z-index: 500' in css
    z600 = 'z-index: 600' in css
    issues.append(f"{'OK' if z500 else 'WARN'}: .site-header z-index 500 {'found' if z500 else 'missing'}")
    issues.append(f"{'OK' if z600 else 'WARN'}: .dropdown z-index 600 {'found' if z600 else 'missing'}")

    # 3. Check for min-width or max-width that might overflow
    minw = re.findall(r'min-width:\s*(\d+px)', css)
    for mw in minw:
        if int(mw.replace('px', '')) > 300:
            issues.append(f"INFO: min-width={mw} found, check if it causes overflow on phones")

    # 4. Check for absolute positioning inside mobile context
    if 'position: absolute' in css:
        issues.append("INFO: absolute positioning present — verify no overlap at <=320px")

    # 5. Check for form/input sizing at small screens
    if 'padding:' in css:
        issues.append("INFO: form padding present — verify touch target min 44px at small screens")

    # 6. Check reduced motion support
    if 'prefers-reduced-motion' in css:
        issues.append("OK: prefers-reduced-motion supported")
    else:
        issues.append("WARN: prefers-reduced-motion not found")

    # 7. Check for mobile menu being hidden/display toggled
    open_cls = '.mobile-open' in css
    issues.append(f"{'OK' if open_cls else 'WARN'}: .mobile-open class {'found' if open_cls else 'missing'}")

    # 8. Check for main-nav background change
    if 'background: var(--color-bg-alt)' in css and 'backdrop-filter' in css:
        issues.append("OK: mobile menu background is solid with blur")
    elif 'background: var(--color-bg-glass)' in css:
        issues.append("WARN: mobile menu still uses transparent --color-bg-glass")
    else:
        issues.append("INFO: verify mobile menu background manually")

    # 9. Check responsive breakpoints
    breakpoints = re.findall(r'@media\s*\(.*max-width:\s*(\d+px)', css)
    issues.append(f"INFO: Responsive breakpoints found: {', '.join(breakpoints)}")

    # 10. Check for font-size scaling with clamp
    if 'clamp(' in css:
        issues.append("OK: clamp() used for fluid font sizing")
    else:
        issues.append("INFO: no clamp() found — verify font sizes on small screens")

    # Output
    for issue in issues:
        print(issue)
    print(f"\nTotal checks: {len(issues)}")
    print(f"Issues/Warnings: {sum(1 for i in issues if i.startswith('WARN'))}")
    print(f"Infos: {sum(1 for i in issues if i.startswith('INFO'))}")
    print(f"OKs: {sum(1 for i in issues if i.startswith('OK'))}")

if __name__ == '__main__':
    main()
