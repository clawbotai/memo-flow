import { RouterProvider, createHashRouter } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { DesktopAppShell } from "@desktop/components/DesktopAppShell";
import { DesktopHomePage } from "@desktop/pages/DesktopHomePage";
import { DesktopPodcastPage } from "@desktop/pages/DesktopPodcastPage";
import { DesktopTranscriptionDetailPage } from "@desktop/pages/DesktopTranscriptionDetailPage";
import { DesktopTranscriptionsPage } from "@desktop/pages/DesktopTranscriptionsPage";
import { DesktopSettingsPage } from "@desktop/pages/DesktopSettingsPage";

const router = createHashRouter([
  {
    path: "/",
    element: <DesktopAppShell />,
    children: [
      {
        index: true,
        element: <DesktopHomePage />,
      },
      {
        path: "/podcast",
        element: <DesktopPodcastPage />,
      },
      {
        path: "/transcriptions",
        element: <DesktopTranscriptionsPage />,
      },
      {
        path: "/transcriptions/:id",
        element: <DesktopTranscriptionDetailPage />,
      },
      {
        path: "/settings",
        element: <DesktopSettingsPage />,
      },
    ],
  },
]);

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
