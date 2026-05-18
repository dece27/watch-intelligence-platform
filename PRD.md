# WatchVault - Luxury Watch Portfolio Intelligence Platform

WatchVault is a comprehensive luxury watch portfolio management system that combines collection tracking, analytics, market intelligence, AI-powered insights, deal discovery, and professional appraisal reporting in a unified, elegant platform.

**Experience Qualities**: 
1. **Sophisticated** - The interface should evoke the refined elegance of haute horlogerie with rich typography and luxurious materials
2. **Intelligent** - Data-driven insights feel immediate and authoritative, presenting complex information with clarity
3. **Comprehensive** - Every aspect of watch collecting is accessible without overwhelming, using progressive disclosure and spatial organization

**Complexity Level**: Complex Application (advanced functionality with multiple views)
This platform integrates 6 distinct modules with shared state, real-time analytics, AI integration, and complex data relationships. Each module serves a specialized function while contributing to a unified portfolio intelligence ecosystem.

## Essential Features

### 1. Collection Module (Watch Catalog)
- **Functionality**: Complete watch inventory management with detailed specifications
- **Purpose**: Central repository for all watches in the portfolio
- **Trigger**: User clicks "Collection" in sidebar or adds first watch
- **Progression**: View grid/list → Select watch → View full details → Edit/Delete
- **Success criteria**: Watches persist in storage, display with images and key specs, support CRUD operations

### 2. Portfolio Module (Analytics Dashboard)
- **Functionality**: Visual analytics showing portfolio composition, value distribution, and key metrics
- **Purpose**: Provides data-driven insights into collection value and composition
- **Trigger**: User clicks "Portfolio" in sidebar
- **Progression**: View dashboard → Analyze charts → Identify insights → Act on data
- **Success criteria**: Real-time calculation of total value, brand distribution charts, condition analysis, purchase timeline

### 3. Market Module (Price Intelligence)
- **Functionality**: Current market price tracking and value estimation for watches
- **Purpose**: Keeps collectors informed of market trends and watch valuations
- **Trigger**: User clicks "Market" in sidebar
- **Progression**: View market overview → Select watch → See price analysis → Track trends
- **Success criteria**: Display estimated market values, appreciation percentages, market sentiment indicators

### 4. AI Advisor Module (Signal Engine + Chat)
- **Functionality**: AI-powered recommendations and conversational insights about the collection
- **Purpose**: Provides intelligent guidance on collecting strategy and portfolio optimization
- **Trigger**: User clicks "AI Advisor" in sidebar
- **Progression**: View signals → Read insights → Ask questions → Receive recommendations
- **Success criteria**: Generate contextual signals, answer questions about collection, provide actionable recommendations

### 5. Deals Module (Deal Flow Scanner)
- **Functionality**: Curated opportunities and recommendations for portfolio expansion
- **Purpose**: Helps identify strategic acquisitions aligned with collection goals
- **Trigger**: User clicks "Deals" in sidebar
- **Progression**: Browse deals → Filter by criteria → Evaluate opportunity → Save favorites
- **Success criteria**: Display relevant opportunities, filter by brand/price/type, show match score with collection

### 6. Appraisal Module (Report Generator)
- **Functionality**: Professional PDF-ready appraisal reports for insurance or sale
- **Purpose**: Creates formal documentation of watch value and provenance
- **Trigger**: User clicks "Appraisal" in sidebar, selects watch
- **Progression**: Select watch → Review details → Generate report → Export/Print
- **Success criteria**: Professional formatting, comprehensive details, printable output

### 7. Onboarding Experience
- **Functionality**: Welcome modal for new users with zero watches
- **Purpose**: Guides users to their first action and sets expectations
- **Trigger**: App loads with empty collection
- **Progression**: See welcome message → Click "Add Watch" → Begin collection
- **Success criteria**: Modal appears only when collection is empty, dismisses on watch addition

## Edge Case Handling
- **Empty States**: Each module shows contextual empty state messaging when no data exists
- **Data Validation**: Required fields enforced, numeric values validated, date logic checked
- **Storage Failures**: Graceful degradation with user feedback if persistence fails
- **Missing Images**: Placeholder displays when watch image URL is invalid or missing
- **Calculation Errors**: Handles division by zero, missing values in analytics
- **AI Unavailability**: Fallback messaging if LLM calls fail

## Design Direction
The design should feel like entering a private vault at a prestigious auction house - dark, refined, with touches of warm gold that catch the eye like polished complications on a watch dial. Every surface should feel considered, every interaction smooth as a well-oiled movement.

## Color Selection
A sophisticated dark palette with warm metallic accents evokes the exclusivity and craftsmanship of luxury timepieces.

- **Primary Color**: Rich Black (#0A0A0B / oklch(0.04 0 0)) - Deep, luxurious background that makes content float
- **Secondary Colors**: 
  - Blue-Grey (#8B9EB7 / oklch(0.65 0.025 240)) - Cool, professional tone for secondary information
  - Success Green (#5E8C6A / oklch(0.58 0.06 150)) - Subtle approval for positive metrics
- **Accent Color**: Champagne Gold (#C9A84C / oklch(0.72 0.09 85)) - Warm, precious metal tone for CTAs and highlights
- **Foreground/Background Pairings**: 
  - Background (#0A0A0B): Light text (#E8E4DC) - High contrast ✓
  - Gold accent (#C9A84C): Dark text (#0A0A0B) - Ratio 11.2:1 ✓
  - Card (rgba(255,255,255,0.025)): Light text (#E8E4DC) - Ratio 14.8:1 ✓
  - Blue-grey (#8B9EB7): Dark background (#0A0A0B) - Ratio 7.2:1 ✓

## Font Selection
Typography should balance the heritage of traditional watchmaking with modern interface clarity - Georgia serif brings gravitas to headings while system fonts ensure legibility.

- **Typographic Hierarchy**: 
  - H1 (Module Titles): Georgia/32px/600/tight letter-spacing
  - H2 (Section Headers): Georgia/24px/600/normal
  - H3 (Card Titles): Georgia/18px/500/normal
  - Body (Primary): system-ui/14px/400/relaxed line-height
  - Body (Secondary): system-ui/13px/400/muted color
  - Labels: system-ui/12px/500/uppercase tracking-wide
  - Numbers (Metrics): system-ui/28px/600/tabular-nums

## Animations
Interactions should feel mechanical yet fluid, like the precision movement of a chronograph - purposeful, never frivolous. Subtle spring physics on cards, smooth page transitions, and gentle hover states create tactile engagement.

- Page transitions: 300ms fade with slight scale (0.98 to 1.0)
- Card hover: Lift effect with subtle glow, 200ms ease-out
- Sidebar navigation: Smooth highlight transition, 150ms
- Modal entry: Fade + scale from 0.95, 250ms spring
- Chart animations: Staggered entry, 400ms ease-out per element
- Button press: Quick scale to 0.97, 100ms

## Component Selection
- **Components**: 
  - Sidebar: Custom component with navigation items and active state
  - Dialog: Radix Dialog for welcome modal and add watch forms
  - Card: Shadcn Card for watch items, metric tiles, and content containers
  - Button: Shadcn Button with gold variant for primary actions
  - Input/Textarea: Shadcn inputs with custom gold focus ring
  - Select: Shadcn Select for brand, condition, type dropdowns
  - Tabs: Shadcn Tabs for switching views within modules
  - Badge: Shadcn Badge for status indicators and tags
  - Scroll Area: Shadcn Scroll Area for long lists
  - Avatar: Shadcn Avatar for user profile (if needed)
  
- **Customizations**: 
  - Gold button variant with champagne gold background
  - Card component with semi-transparent background and subtle border
  - Custom sidebar navigation with icon + label layout
  - Chart components using recharts with custom theme colors
  
- **States**: 
  - Buttons: Subtle brightness increase on hover, scale down on press, muted when disabled
  - Inputs: Gold ring on focus, red ring on error
  - Cards: Slight elevation and border glow on hover
  - Nav items: Gold left border and background tint when active
  
- **Icon Selection**: 
  - Collection: Diamond (◈)
  - Portfolio: Target/Bullseye (◎)
  - Market: Circle dot (◉)
  - AI Advisor: Circle rings (◍)
  - Deals: Grid (◫)
  - Appraisal: Circle outline (◌)
  - Plus: For add actions
  - TrendUp/TrendDown: For market indicators
  - ChartBar/ChartLine: For analytics
  - Trash: For delete actions
  - Pencil: For edit actions
  
- **Spacing**: 
  - Page padding: 6 (24px)
  - Card padding: 6 (24px)
  - Card gaps: 4 (16px)
  - Section spacing: 8 (32px)
  - Sidebar width: 240px
  - Content max-width: 1400px
  
- **Mobile**: 
  - Sidebar collapses to bottom navigation bar
  - Grid layouts switch to single column
  - Cards maintain full width with vertical stacking
  - Header becomes sticky with reduced height
  - Modals occupy full screen with safe margins
