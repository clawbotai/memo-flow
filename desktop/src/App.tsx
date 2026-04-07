import { RouterProvider, createHashRouter } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { DesktopAppShell } from "@desktop/components/DesktopAppShell";
import { DesktopHomePage } from "@desktop/pages/DesktopHomePage";
import { DesktopPodcastPage } from "@desktop/pages/DesktopPodcastPage";
import { DesktopTranscriptionDetailPage } from "@desktop/pages/DesktopTranscriptionDetailPage";
import { DesktopTranscriptionsPage } from "@desktop/pages/DesktopTranscriptionsPage";

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
