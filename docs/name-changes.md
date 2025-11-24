# Domain Model Naming Changes

This document outlines the terminology changes made to better reflect the "PO Box" metaphor.

## Summary

| Old Term | New Term | Rationale |
|----------|----------|-----------|
| Zorter | Zobox | Emphasizes the "inbox/PO Box" concept |
| Item | Message | Messages arrive at a PO Box |
| Consumer | Subscriber | Someone who subscribes to receive messages |
| Workflow | Sorter | Sorting rules process incoming messages |
| RouteProfile | Destination | Messages are forwarded to destinations |

## Detailed Changes

### Zorter → Zobox

**What changed:**
- Package name: `zorter` → `zobox`
- Binary command: `zorter` → `zobox`
- Config section: `[zorter]` → `[zobox]`
- Environment variables: `ZORTER_*` → `ZOBOX_*`
- Type names: `ZorterConfig` → `ZoboxConfig`

**Why:** The name "Zobox" better communicates the core concept of a digital PO Box where messages arrive and get sorted.

### Item → Message

**What changed:**
- API endpoints: `/items` → `/messages`
- Database table: `items` → `messages`
- Types: `ItemEnvelope` → `MessageEnvelope`, `ItemView` → `MessageView`
- Functions: `processAndStoreItem` → `processAndStoreMessage`

**Why:** "Message" is the natural term for what arrives at a PO Box.

### Consumer → Subscriber

**What changed:**
- API parameters: `consumer` → `subscriber`
- Database columns: `claimed_by` → `subscribed_by`, `claimed_at` → `subscribed_at`
- Query parameters: `?consumer=` → `?subscriber=`

**Why:** A "subscriber" conceptually subscribes to receive messages from a PO Box, rather than just "consuming" items.

### Workflow → Sorter

**What changed:**
- Config section: `[workflows]` → `[sorters]`
- Types: `WorkflowDefinition` → `SorterDefinition`
- Config key: `config.workflows` → `config.sorters`

**Why:** "Sorter" directly describes what these rules do—they sort incoming messages based on type, applying side effects and routing.

### RouteProfile → Destination

**What changed:**
- Config section: `[destinations]` renamed from `[profiles]`
- Types: `RouteProfile` → `Destination`
- File: `profiles.ts` → `destinations.ts`

**Why:** "Destination" clearly communicates that messages are forwarded to these targets—like forwarding mail from a PO Box.

## Migration Notes

These changes were made as a complete refactor with no backwards compatibility concerns (greenfield project). All references were updated across:

- Source code (types, functions, variables)
- Database schema and migrations
- Configuration files (TOML)
- API endpoints and parameters
- Documentation and comments
