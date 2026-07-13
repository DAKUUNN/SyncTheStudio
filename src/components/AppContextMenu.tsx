import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { copyText, pasteText } from "@/lib/clipboard";
import { useIsIOS } from "@/lib/platform";
import {
  IconClipboard,
  IconCopy,
  IconScissors,
  IconRefresh,
  IconArrowLeft,
  IconArrowRight,
} from "./Icons";

type EditableEl = HTMLInputElement | HTMLTextAreaElement;

interface MenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  run: () => void;
}

function isEditable(el: Element | null): el is EditableEl {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function setNativeValue(el: EditableEl, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Replaces the webview's default right-click menu (Inspect Element, View
 *  Page Source, Save As…) with app-relevant actions: clipboard operations
 *  inside text fields, or reload/back/forward everywhere else. Desktop-only:
 *  there's no right-click on a touchscreen, and on iOS WKWebView a
 *  long-press synthesizes the same `contextmenu` event a scroll gesture
 *  starts with, so listening for it here would hijack scrolling. */
export function AppContextMenu() {
  const { t } = useI18n();
  const isIOS = useIsIOS();
  const [state, setState] = useState<{ x: number; y: number; actions: MenuAction[] } | null>(null);

  useEffect(() => {
    if (isIOS) return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const target = e.target as Element | null;
      const editable = isEditable(target?.closest("input, textarea") ?? null)
        ? (target!.closest("input, textarea") as EditableEl)
        : null;

      let actions: MenuAction[];

      if (editable) {
        const hasSelection = editable.selectionStart !== editable.selectionEnd;
        const hasValue = editable.value.length > 0;
        actions = [
          {
            id: "cut",
            label: t("contextMenu.cut"),
            icon: <IconScissors style={{ width: 14, height: 14 }} />,
            disabled: !hasSelection,
            run: () => {
              const { selectionStart, selectionEnd, value } = editable;
              const selected = value.substring(selectionStart ?? 0, selectionEnd ?? 0);
              void copyText(selected).then(() => {
                const next = value.slice(0, selectionStart ?? 0) + value.slice(selectionEnd ?? 0);
                setNativeValue(editable, next);
                const pos = selectionStart ?? 0;
                editable.focus();
                editable.setSelectionRange(pos, pos);
              });
            },
          },
          {
            id: "copy",
            label: t("contextMenu.copy"),
            icon: <IconCopy style={{ width: 14, height: 14 }} />,
            disabled: !hasSelection,
            run: () => {
              const { selectionStart, selectionEnd, value } = editable;
              void copyText(value.substring(selectionStart ?? 0, selectionEnd ?? 0));
            },
          },
          {
            id: "paste",
            label: t("contextMenu.paste"),
            icon: <IconClipboard style={{ width: 14, height: 14 }} />,
            run: () => {
              void pasteText().then((text) => {
                if (text === null) return;
                const { selectionStart, selectionEnd, value } = editable;
                const start = selectionStart ?? value.length;
                const end = selectionEnd ?? value.length;
                const next = value.slice(0, start) + text + value.slice(end);
                setNativeValue(editable, next);
                const pos = start + text.length;
                editable.focus();
                editable.setSelectionRange(pos, pos);
              });
            },
          },
          {
            id: "selectAll",
            label: t("contextMenu.selectAll"),
            icon: <IconCopy style={{ width: 14, height: 14 }} />,
            disabled: !hasValue,
            run: () => {
              editable.focus();
              editable.select();
            },
          },
        ];
      } else {
        const selectedText = window.getSelection()?.toString() ?? "";
        actions = [
          ...(selectedText
            ? [
                {
                  id: "copy",
                  label: t("contextMenu.copy"),
                  icon: <IconCopy style={{ width: 14, height: 14 }} />,
                  run: () => void copyText(selectedText),
                },
              ]
            : []),
          {
            id: "back",
            label: t("contextMenu.back"),
            icon: <IconArrowLeft style={{ width: 14, height: 14 }} />,
            run: () => window.history.back(),
          },
          {
            id: "forward",
            label: t("contextMenu.forward"),
            icon: <IconArrowRight style={{ width: 14, height: 14 }} />,
            run: () => window.history.forward(),
          },
          {
            id: "reload",
            label: t("contextMenu.reload"),
            icon: <IconRefresh style={{ width: 14, height: 14 }} />,
            run: () => window.location.reload(),
          },
        ];
      }

      const menuWidth = 190;
      const menuHeight = actions.length * 34 + 8;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
      setState({ x, y, actions });
    };

    const close = () => setState(null);

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [t, isIOS]);

  if (isIOS || !state) return null;

  return (
    <div
      className="app-context-menu"
      style={{ top: state.y, left: state.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {state.actions.map((action) => (
        <button
          key={action.id}
          className="app-context-menu-item"
          disabled={action.disabled}
          onClick={() => {
            action.run();
            setState(null);
          }}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}
