// App root: providers + the router. Everything else (navigation, route selection, URL state)
// lives in the route tree — see src/router.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "./hooks/useTheme";
import { SplashScreen } from "./components/SplashScreen";
import { router } from "./router";
import { SelectionResetOnRegion } from "./state/SelectionResetOnRegion";

// global singletons

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export { PathLinkRestore } from "./features/packets/PathLinkRestore";
export { SelectionResetOnRegion };

export function App({ appRouter = router }: { appRouter?: typeof router }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SplashScreen />
        <RouterProvider router={appRouter} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
