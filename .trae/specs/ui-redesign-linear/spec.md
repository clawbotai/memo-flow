# UI Redesign: Linear Style Spec

## Why
The current UI uses a "Flow" style (blue-centric, rounded, soft). The goal is to transition to a "Linear" style (refined, minimal, dark-mode focused, subtle borders, high precision) to elevate the aesthetic quality and provide a more professional, modern feel.

## What Changes
- **Design System Update**:
  - **Color Palette**: Shift from "Flow Blue" to a neutral-based palette (Zinc/Slate) with subtle accents.
  - **Typography**: Refine font weights and line heights for better readability and elegance (Inter).
  - **Borders & Shadows**: Implement 1px subtle borders with low opacity and "glow" effects for active states.
  - **Radius**: Reduce global border radius (e.g., from `0.75rem` to `0.5rem` or `0.375rem`) for a sharper look.
  - **Dark Mode**: Prioritize dark mode as the default or primary experience.

- **Component Refinements (shadcn/ui)**:
  - **Button**: Add subtle borders, inner shadows, and refined hover states.
  - **Input**: Add focus rings with glow effects and subtle background adjustments.
  - **Card**: Use subtle borders and background blur (glassmorphism) or solid dark backgrounds with noise texture.
  - **Dialog/Modal**: Refine backdrops and animations.

- **Layout Updates**:
  - Update global background colors to matching dark/zinc tones.
  - Ensure consistent spacing and alignment.

## Impact
- **Affected Files**:
  - `src/styles/globals.css`: CSS variables and global styles.
  - `tailwind.config.ts`: Configuration for colors, shadows, and animations.
  - `src/components/ui/*.tsx`: Individual component styles (Button, Card, Input, etc.).
  - `src/app/layout.tsx`: Root layout structure.
- **Functionality**:
  - **NO functional changes**. All features (notes, analysis, etc.) must remain operational.
  - **Responsiveness**: Must be maintained across mobile and desktop.

## ADDED Requirements
### Requirement: Linear Aesthetic
The system SHALL use a "Linear" aesthetic characterized by:
- Neutral, high-contrast typography (Zinc/Slate).
- Subtle, semi-transparent borders (e.g., `border-white/10` in dark mode).
- "Glow" or "Shine" effects on interaction (hover/focus).
- Minimalist iconography.

#### Scenario: Dark Mode Experience
- **WHEN** user opens the app
- **THEN** the interface defaults to a refined dark theme (or respects system preference with a high-quality dark implementation).

## MODIFIED Requirements
### Requirement: Component Styles
Existing shadcn/ui components SHALL be styled to match the Linear aesthetic.
- **Button**: Should have a subtle gradient border or inner shadow.
- **Card**: Should have a delicate border and potentially a subtle gradient background.

## REMOVED Requirements
### Requirement: "Flow" Style
**Reason**: Replaced by "Linear" style.
**Migration**: Remove `Flow Blue` specific variables and animations if they conflict or are unused.
