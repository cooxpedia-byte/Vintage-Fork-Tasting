# Split-flap timer module

This directory is deliberately self-contained so the timer face can be refined before it is connected to the Infusion Time Machine.

```tsx
import { SplitFlapTimer } from "@/components/split-flap";

<SplitFlapTimer
  totalSeconds={120}
  powered
  running={false}
  statusText="READY"
/>
```

The component accepts a duration from `00:00:00` through `99:59:59`. It owns only the visual flap transitions; the parent owns countdown state, controls, sounds, and persistence. Styling is isolated in a CSS Module and has no dependency on the app's global timer styles.

Use `/split-flap-lab` as the development workbench.
