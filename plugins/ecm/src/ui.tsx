import {
  Label,
  type LabelProps,
  Panel,
  Page,
  ScriptPrelude,
  WindowFrame,
  kit,
} from "@tmcontrolpanel/plugin-sdk/ui";
import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, Publish, type Integer } from "maniatsx/client";
import {
  CMlEntry,
  CMlFrame,
  CMlLabel,
  TextLib,
  vec2,
  vec3,
} from "maniatsx/maniascript";
import type { WindowView, WindowActions } from "./types";
import { WINDOW_SIZE } from "./constants";
const CONTENT_WIDTH = WINDOW_SIZE[0] - 4;

// Icon font glyphs: dot, eye and crossed eye
const DOT = "\uf111";
const EYE = "\uf06e";
const EYE_SLASH = "\uf070";

// Written by the update page, read by the window
const view = client.shared<WindowView>("window", {
  isEditor: false,
  apiKey: "",
  isRecording: false,
  currentRound: 1,
});
const contentRef = client.ref<CMlFrame>();
const dotRef = client.ref<CMlLabel>();
const toggleFrameRef = client.ref<CMlFrame>();
const apiKeyFrameRef = client.ref<CMlFrame>();
const roundFrameRef = client.ref<CMlFrame>();
const roundControlsRef = client.ref<CMlFrame>();
const entryRef = client.ref<CMlEntry>();
const eyeRef = client.ref<CMlLabel>();
const errorRef = client.ref<CMlLabel>();

const recordingText = client.fn((recording: boolean): string => {
  if (recording) return "Recording";
  return "Not Recording";
});
const toggleText = client.fn((recording: boolean): string => {
  if (recording) return "Stop recording";
  return "Start recording";
});

function WindowBehavior() {
  client.watch(view, () => {
    const editor = view.value.isEditor;
    if (editor) {
      toggleFrameRef.control.Show();
      apiKeyFrameRef.control.Show();
      roundControlsRef.control.Show();
      roundFrameRef.control.RelativePosition_V3 = vec2(0.0, -19.0);
    } else {
      toggleFrameRef.control.Hide();
      apiKeyFrameRef.control.Hide();
      roundControlsRef.control.Hide();
      roundFrameRef.control.RelativePosition_V3 = vec2(0.0, -6.0);
    }
    // 2/16 and 14/16: the template's 2D2 and D22
    if (view.value.isRecording)
      dotRef.control.TextColor = vec3(0.125, 0.875, 0.125);
    else dotRef.control.TextColor = vec3(0.875, 0.125, 0.125);
    entryRef.control.SetText(view.value.apiKey, false);
    contentRef.control.Show();
  });
  return null;
}

// A muted button with a thin underline, sending a native action (with the entry values)
function Button(props: {
  id: string;
  x: number;
  width: number;
  action: string;
  text: LabelProps["text"];
  broadcast?: boolean;
}) {
  return (
    <frame id={props.id} pos={[props.x, 0]} size={[props.width, 5]}>
      {props.broadcast ? (
        <quad
          size={[props.width, 5]}
          bgcolor="FFF"
          opacity={0.08}
          action={props.action}
        />
      ) : (
        <>
          <Panel
            tone="contentAlt"
            size={[props.width, 5]}
            action={props.action}
          />
          <Panel tone="surface" pos={[0, -4.75]} size={[props.width, 0.25]} />
        </>
      )}
      <Label
        tone="contentText"
        font="body"
        pos={[props.width / 2, -2.25]}
        text={props.text}
        textsize={1}
        valign="center"
        halign="center"
      />
    </frame>
  );
}

function SectionTitle(props: { text: string }) {
  return (
    <Label
      tone="contentText"
      font="title"
      pos={[0, -2.25]}
      size={[25, 3]}
      text={props.text}
      textsize={0.6}
      valign="center"
    />
  );
}

function EcmWindowView(
  props: WidgetRenderProps & { actions: WindowActions; broadcast?: boolean },
) {
  const { color } = kit.useTokens();
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowBehavior />
      <WindowFrame id={props.id} title={props.title} size={WINDOW_SIZE}>
        <frame
          ref={contentRef}
          pos={[2, -2]}
          size={[CONTENT_WIDTH, WINDOW_SIZE[1] - 4]}
          hidden
        >
          <frame size={[CONTENT_WIDTH, 5]}>
            <label
              ref={dotRef}
              text={DOT}
              pos={[0, -2.25]}
              textcolor="D22"
              textsize={1}
              valign="center"
            />
            <Label
              tone="contentText"
              font="body"
              pos={[3.5, -2.25]}
              size={[20, 5]}
              text={client.bind(() => recordingText(view.value.isRecording))}
              textsize={1}
              valign="center"
            />
            <frame ref={toggleFrameRef} pos={[25, 0]} size={[25, 5]}>
              <Button
                id="toggle-recording"
                x={0}
                width={25}
                action={props.actions.toggle}
                text={client.bind(() => toggleText(view.value.isRecording))}
                broadcast={props.broadcast}
              />
            </frame>
          </frame>

          <frame
            ref={apiKeyFrameRef}
            pos={[0, -6]}
            size={[CONTENT_WIDTH, 12.25]}
          >
            <SectionTitle text="API Key" />
            <frame pos={[0, -4.5]} size={[CONTENT_WIDTH, 7.75]}>
              <Panel tone="surface" pos={[0, -4.75]} size={[37, 0.25]} />
              <entry
                ref={entryRef}
                pos={[0, -2.25]}
                default=""
                size={[32, 5]}
                name="ecm-api-key-entry"
                id="ecm-api-key-entry"
                textsize={1}
                focusareacolor1={props.broadcast ? "FFF1" : color.contentAlt}
                focusareacolor2={props.broadcast ? "FFF2" : color.contentAlt}
                textcolor={color.contentText}
                textformat="Password"
                valuetype="Ml_String"
                valign="center"
                textfont="GameFontRegular"
                onSubmit={client.handler(() => {
                  const value = entryRef.control.Value;
                  const underscores: Integer =
                    TextLib.Split("_", value).length - 1;
                  if (TextLib.Length(value) > 0 && underscores !== 1)
                    errorRef.control.SetText(
                      "Expected 1 underscore, found " +
                        TextLib.ToText(underscores),
                    );
                  else errorRef.control.SetText("");
                })}
              />
              <label
                ref={eyeRef}
                pos={[34.5, -2.25]}
                size={[5, 5]}
                text={EYE}
                textcolor={color.contentText}
                focusareacolor1={props.broadcast ? "FFF1" : color.contentAlt}
                focusareacolor2={props.broadcast ? "FFF2" : color.contentAlt}
                halign="center"
                valign="center"
                textsize={1}
                onClick={client.handler(() => {
                  if (
                    entryRef.control.TextFormat ===
                    CMlEntry.ETextFormat.Password
                  ) {
                    entryRef.control.TextFormat = CMlEntry.ETextFormat.Basic;
                    eyeRef.control.SetText(EYE_SLASH);
                  } else {
                    entryRef.control.TextFormat = CMlEntry.ETextFormat.Password;
                    eyeRef.control.SetText(EYE);
                  }
                })}
              />
              <Button
                id="save-api-key"
                x={38}
                width={12}
                action={props.actions.save}
                text="Save"
                broadcast={props.broadcast}
              />
              <label
                ref={errorRef}
                pos={[0, -6.25]}
                size={[CONTENT_WIDTH, 3]}
                text=""
                textsize={0.6}
                textcolor="D22"
                valign="center"
                textfont="GameFontRegular"
              />
            </frame>
          </frame>

          <frame ref={roundFrameRef} pos={[0, -19]} size={[CONTENT_WIDTH, 9.5]}>
            <SectionTitle text="Round info" />
            <frame pos={[0, -4.5]} size={[CONTENT_WIDTH, 5]}>
              <Label
                tone="contentText"
                font="body"
                pos={[0, -2.25]}
                size={[12, 5]}
                text={client.bind(
                  () => "Round " + TextLib.ToText(view.value.currentRound),
                )}
                textsize={1}
                valign="center"
              />
              <frame ref={roundControlsRef}>
                <Button
                  id="decrease-round-offset"
                  x={14}
                  width={5}
                  action={props.actions.decrease}
                  text="-"
                  broadcast={props.broadcast}
                />
                <Button
                  id="increase-round-offset"
                  x={20}
                  width={5}
                  action={props.actions.increase}
                  text="+"
                  broadcast={props.broadcast}
                />
              </frame>
            </frame>
          </frame>
        </frame>
      </WindowFrame>
    </Page>
  );
}

function DefaultEcmWindow(
  props: WidgetRenderProps & { actions: WindowActions },
) {
  return <EcmWindowView {...props} />;
}

function BroadcastEcmWindow(
  props: WidgetRenderProps & { actions: WindowActions },
) {
  return <EcmWindowView {...props} broadcast />;
}

export const EcmWindow = slot<WidgetRenderProps & { actions: WindowActions }>(
  "ecm/window",
  DefaultEcmWindow,
  { broadcast: BroadcastEcmWindow },
);

export function EcmWindowUpdate(props: WidgetRenderProps) {
  return (
    <Manialink id={props.id}>
      <Publish to={view} value={props.data as WindowView} />
    </Manialink>
  );
}

export function ecmWindowComponent(actions: WindowActions) {
  return (props: WidgetRenderProps) => (
    <EcmWindow {...props} actions={actions} />
  );
}
