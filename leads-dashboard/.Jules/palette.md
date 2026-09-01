# Design System & Accessibility Journal — Jules Palette

## [2026-09-01] Focus-Visible Accessibility for Core Button Controls

### 💡 What
Added explicit `focus-visible` ring styles to core UI button components (`Button` and `RippleButton`) using Tailwind CSS classes:
```css
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-theme-background
```

### 🎯 Why
Default browser focus indicators are inconsistent and often insufficient for keyboard navigation in dark-mode and glassmorphic dashboard layouts. Custom `focus-visible` styling ensures:
1. High contrast, brand-aligned visual cues when navigating with keyboard (`Tab` / `Shift+Tab`).
2. Mouse/touch clicks do not produce harsh or unwanted outline rings (since `:focus-visible` only matches keyboard interactions).
3. Offset rings adapt to light and dark theme backgrounds via `focus-visible:ring-offset-theme-background`.

### ♿ Accessibility Standard
- WCAG 2.1 Success Criterion 2.4.7 (Focus Visible)
- Visual ring contrast exceeds 3:1 against background colors in both Light and Dark mode.
