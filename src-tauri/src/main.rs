// SPDX-License-Identifier: AGPL-3.0-or-later

// Without this, release builds on Windows open a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    landms_lib::run();
}
