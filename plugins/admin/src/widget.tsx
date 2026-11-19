import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";

export function NotifyAdminWidget(props: WidgetRenderProps) {
  const data = props.data as { action: string };
  return (
    <WidgetFrame {...props}>
      <Panel tone="content" size={[36, 8]} />
      <Panel tone="surface" pos={[0, -8]} size={[36, 0.5]} />
      <Label
        tone="contentText"
        font="title"
        pos={[18, -3.75]}
        size={[36, 8]}
        text="Notify Admin"
        halign="center"
        valign="center"
        textsize={2}
      />
      <quad
        pos={[0, 0]}
        z-index={-2}
        size={[36, 8.5]}
        scriptevents
        bgcolor="000000"
        opacity={0}
        action={data.action}
      />
    </WidgetFrame>
  );
}
