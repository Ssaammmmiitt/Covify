use tauri::{Emitter, Manager};
use tauri::http::Response;

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Register single-instance plugin first
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!("A second instance was launched with args: {argv:?}, cwd: {cwd}");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                _app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Launch Spotify desktop app in the background on startup
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("open")
                    .arg("-g")
                    .arg("-a")
                    .arg("Spotify")
                    .spawn();
            }
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("cmd")
                    .args(&["/C", "start", "spotify:"])
                    .spawn();
            }

            // Spawn a thread to bring the Covify app window back to focus / foreground
            // shortly after launch, ensuring it sits on top of the Spotify player window.
            let handle = _app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_platform])
        .register_uri_scheme_protocol("covify", move |ctx, request| {
            let url = request.uri().to_string();
            // Emit event to all webview windows
            if let Some(window) = ctx.app_handle().get_webview_window("main") {
                let _ = window.emit("oauth_redirect", url.clone());
            }
            // Return a blank page — the window closes itself via JS
            Response::builder()
                .header("Content-Type", "text/html")
                .body(b"<html><body><script>window.close();</script></body></html>".to_vec())
                .unwrap()
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
