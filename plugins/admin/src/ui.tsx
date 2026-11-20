import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";
import { slot } from "maniatsx/theme";

function DefaultNotifyAdminWidget(props: WidgetRenderProps) {
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

function BroadcastNotifyAdminWidget(props: WidgetRenderProps) {
  const data = props.data as { action: string };
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[8, 8]} />
      <Panel tone="content" pos={[8, 0]} size={[28, 8]} />
      <Label
        tone="accent"
        font="title"
        pos={[4, -3.75]}
        size={[8, 8]}
        text="!"
        halign="center"
        valign="center"
        textsize={2}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[10, -3.75]}
        size={[24, 8]}
        text="Notify Admin"
        textprefix="$t"
        valign="center"
        textsize={1.5}
      />
      <quad
        pos={[0, 0]}
        z-index={-2}
        size={[36, 8]}
        scriptevents
        bgcolor="000000"
        opacity={0}
        action={data.action}
      />
    </WidgetFrame>
  );
}

export const NotifyAdminWidget = slot<WidgetRenderProps>(
  "admin/notify-admin",
  DefaultNotifyAdminWidget,
  {
    broadcast: BroadcastNotifyAdminWidget,
  },
);
