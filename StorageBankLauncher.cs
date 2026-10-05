using System;
using System.Diagnostics;

class Program {
    static void Main() {
        try {
            // First check if dev server / virtual cloud bridge is running
            Process.Start(new ProcessStartInfo {
                FileName = "http://localhost:5173/",
                UseShellExecute = true
            });
        } catch {
        }
    }
}
