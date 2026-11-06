import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Platform, View } from "react-native";

import { ScreenContent } from "../../components/ui/ScreenContent";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { ThreadDetailScreen, type ThreadDetailScreenProps } from "./ThreadDetailScreen";

type ThreadScreenContent =
  | { readonly props: ThreadDetailScreenProps }
  | { readonly fallback: ReactNode; readonly header?: ReactNode };

function createThreadScreenStore() {
  let current: ThreadScreenContent | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (content: ThreadScreenContent) => {
      current = content;
      for (const listener of listeners) listener();
    },
  };
}
const ThreadScreenContext = createContext<ReturnType<typeof createThreadScreenStore> | null>(null);
type ComposerFullScreen = {
  /** The thread whose composer fills the screen, with the header hidden. */
  readonly threadKey: string | null;
  readonly setThreadKey: (threadKey: string | null) => void;
};
const ComposerFullScreenContext = createContext<ComposerFullScreen | null>(null);

// Owned here so the header and the composer change in the same render.
export function useComposerFullScreen() {
  return useContext(ComposerFullScreenContext);
}

function ThreadScreenOutlet() {
  const store = useContext(ThreadScreenContext)!;
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [fullScreenThreadKey, setFullScreenThreadKey] = useState<string | null>(null);
  if (content === null) return null;
  const headerHidden = fullScreenThreadKey !== null;
  const body = "props" in content ? <ThreadDetailScreen {...content.props} /> : content.fallback;
  // Android draws the header in React, so it stays mounted and returns in the same
  // frame. iOS remounts it to reapply the native options that show it again.
  const header = !("props" in content) ? (
    content.header
  ) : Platform.OS === "android" ? (
    <View style={headerHidden ? { display: "none" } : undefined}>{content.props.header}</View>
  ) : headerHidden ? (
    <NativeStackScreenOptions options={{ headerShown: false }} />
  ) : (
    content.props.header
  );
  return (
    <ComposerFullScreenContext.Provider
      value={{ threadKey: fullScreenThreadKey, setThreadKey: setFullScreenThreadKey }}
    >
      {header}
      <ScreenContent surface="canvas">{body}</ScreenContent>
    </ComposerFullScreenContext.Provider>
  );
}

// Controllers can change from draft to live without replacing the native screen,
// the keyboard host, or the editor. Publish before paint to avoid an intermediate frame.
export function ThreadScreenHost({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createThreadScreenStore);
  return (
    <ThreadScreenContext.Provider value={store}>
      {children}
      <View className="flex-1 bg-screen android:bg-header">
        <ThreadScreenOutlet />
      </View>
    </ThreadScreenContext.Provider>
  );
}

export function ThreadScreenBinding(props: ThreadDetailScreenProps) {
  const store = useContext(ThreadScreenContext)!;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the route's thread screen props to the external store the outlet reads
  useLayoutEffect(() => {
    store.publish({ props });
  });
  return null;
}

export function ThreadScreenFallback({
  children,
  header,
}: {
  readonly children: ReactNode;
  readonly header?: ReactNode;
}) {
  const store = useContext(ThreadScreenContext)!;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the fallback content and header to the external store the outlet reads
  useLayoutEffect(() => {
    store.publish({ fallback: children, header });
  });
  return null;
}
