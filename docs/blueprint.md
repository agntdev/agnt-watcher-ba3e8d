# CryptoWatch — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot for tracking crypto prices with customizable alerts and summaries. Users can create watchlists, set price thresholds and percent move alerts, query prices, and configure quiet hours. The owner gets analytics on usage and top alerts.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual Telegram users interested in cryptocurrency tracking
- Crypto investors and traders
- Telegram bot users seeking personalized price alerts

## Success criteria

- Users can create and manage watchlists with crypto tickers
- Users receive accurate price alerts based on set thresholds and percent moves
- Owner can view analytics including total users and top-fired alerts
- Morning summaries are delivered to opted-in users at their chosen local time

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and onboarding flow
- **/price** (command, actor: user, command: /price) — Query current prices for watchlist or specific ticker
- **Add Ticker** (button, actor: user, callback: watchlist:add) — Add a new ticker to the watchlist with optional nickname
- **Manage Alerts** (button, actor: user, callback: alerts:manage) — View and edit threshold and percent move alerts for selected ticker
- **Configure Quiet Hours** (button, actor: user, callback: settings:quiet_hours) — Set quiet hours window and summary delivery preference
- **Morning Summary** (button, actor: user, callback: settings:morning_summary) — Enable/disable morning summary and set delivery time

## Flows

### Onboarding
_Trigger:_ /start

1. Display welcome message with features
2. Seed watchlist with BTC, ETH, TON
3. Offer buttons to add more tickers or type any ticker

_Data touched:_ User profile

### Watchlist Management
_Trigger:_ watchlist:add

1. Display add ticker options
2. Process user input for ticker/nickname
3. Confirm addition with inline buttons

_Data touched:_ Watchlist item

### Threshold Alert Creation
_Trigger:_ alerts:threshold

1. Select coin from watchlist
2. Enter USD price target
3. Choose above/below direction
4. Confirm alert with inline buttons

_Data touched:_ Price-threshold alert

### Percent Alert Creation
_Trigger:_ alerts:percent

1. Select coin from watchlist
2. Enter percent threshold
3. Confirm alert with 1-hour lookback
4. Confirm alert with inline buttons

_Data touched:_ Percent-move alert

### Price Query
_Trigger:_ /price

1. Parse ticker argument
2. Fetch current price and 1h change
3. Display results with inline buttons for more actions

_Data touched:_ Watchlist item

### Morning Summary
_Trigger:_ settings:morning_summary

1. Enable/disable summary
2. Set local time for delivery
3. Confirm settings

_Data touched:_ User profile

### Quiet Hours Configuration
_Trigger:_ settings:quiet_hours

1. Set start/end times for quiet window
2. Choose summary delivery preference
3. Confirm settings

_Data touched:_ User profile

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — Telegram user's preferences and settings
  - fields: Telegram ID, timezone, language, quiet-hours window, morning-summary time, cooldown override
- **Watchlist item** _(retention: persistent)_ — Crypto ticker being tracked by user
  - fields: ticker, nickname, enabled alerts
- **Price-threshold alert** _(retention: persistent)_ — Alert when price crosses a USD threshold
  - fields: direction, USD target
- **Percent-move alert** _(retention: persistent)_ — Alert when price changes by percent over 1 hour
  - fields: percent threshold
- **Alert history** _(retention: persistent)_ — Record of triggered alerts
  - fields: timestamp, user, ticker, rule, old price, new price, percent change

## Integrations

- **Telegram** (required) — Bot API messaging
- **Market price feed** (required) — Reliable crypto price data with silent retries
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View total active users
- View top 10 alert rules by fire count with timestamps

## Notifications

- Price threshold alerts
- Percent move alerts
- Morning summaries
- Quiet hours summary
- Owner analytics updates

## Permissions & privacy

- All user data is private per Telegram account
- No public or shared watchlists
- No trading/exchange functionality

## Edge cases

- Unknown ticker handling with confirmation
- Price feed failures with silent retries
- Quiet hours alert consolidation
- Cooldown period enforcement between alerts

## Required tests

- Verify watchlist management with add/remove functionality
- Test alert triggering with threshold and percent rules
- Validate morning summary delivery at user-specified time
- Confirm quiet hours behavior with alert consolidation
- Test owner analytics display of top alerts

## Assumptions

- Default seeded tickers are BTC, ETH, TON
- Price feed failures are retried up to 3 times
- Quiet hours default to queue alerts and deliver summary at end
- Cooldown is 30 minutes per user+ticker+rule
