use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const HELPER_HOST: &str = "127.0.0.1";
const HELPER_PORT: u16 = 47392;
const HELPER_SIDECAR_NAME: &str = "memoflow-helper";
const HELPER_WAIT_TIMEOUT: Duration = Duration::from_secs(20);
const HELPER_POLL_INTERVAL: Duration = Duration::from_millis(300);

struct HelperSidecarState(Mutex<Option<CommandChild>>);

fn helper_health_url() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], HELPER_PORT))
}

fn helper_is_healthy() -> bool {
    let addr = helper_health_url();
    let connect_timeout = Duration::from_millis(400);

    let mut stream = match TcpStream::connect_timeout(&addr, connect_timeout) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(connect_timeout));
    let _ = stream.set_write_timeout(Some(connect_timeout));

    if stream
        .write_all(
            format!(
                "GET /health HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
                HELPER_HOST, HELPER_PORT
            )
            .as_bytes(),
        )
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn wait_for_helper(timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
      if helper_is_healthy() {
          return true;
      }
      std::thread::sleep(HELPER_POLL_INTERVAL);
    }

    false
}

fn spawn_helper(app: &tauri::AppHandle) -> Result<Option<CommandChild>, Box<dyn std::error::Error>> {
    if wait_for_helper(Duration::from_millis(600)) {
        return Ok(None);
    }

    let (_events, child) = app
        .shell()
        .sidecar(HELPER_SIDECAR_NAME)?
        .env("MEMOFLOW_HELPER_HOST", HELPER_HOST)
        .env("MEMOFLOW_HELPER_PORT", HELPER_PORT.to_string())
        .spawn()?;

    if wait_for_helper(HELPER_WAIT_TIMEOUT) {
        return Ok(Some(child));
    }

    let _ = child.kill();
    Err("MemoFlow helper sidecar failed to become healthy".into())
}

fn kill_helper(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<HelperSidecarState>() {
        if let Some(child) = state.0.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = child.kill();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let child = spawn_helper(&app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error })?;
            app.manage(HelperSidecarState(Mutex::new(child)));

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            kill_helper(app_handle);
        }
    });
}
