using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using Forms=System.Windows.Forms;

namespace GhostDesk {
    // The GUI holds the write end of the bridge's stdin pipe. Windows closes it
    // even if the GUI is killed, so the hidden child cannot outlive its owner.
    sealed class AppHost : IDisposable {
        readonly Process bridge=new Process();
        readonly Forms.NotifyIcon tray=new Forms.NotifyIcon();
        readonly Forms.ContextMenuStrip menu=new Forms.ContextMenuStrip();
        readonly Icon icon;
        bool started,disposed;

        internal AppHost(int port,DockWindow window) {
            string root=AppDomain.CurrentDomain.BaseDirectory;
            string packaged=Path.Combine(root,"app");
            string source=File.Exists(Path.Combine(packaged,"bridge.mjs"))?packaged:root;
            string node=Path.Combine(root,"runtime","node.exe");
            try {
                if(!File.Exists(Path.Combine(source,"bridge.mjs")))
                    throw new FileNotFoundException("Extract the entire Ghost Desk ZIP before opening the app.");
                if(!File.Exists(node) && source==packaged)
                    throw new FileNotFoundException("The bundled runtime is missing. Extract the entire Ghost Desk ZIP again.");
                bridge.StartInfo=new ProcessStartInfo {
                    FileName=File.Exists(node)?node:"node.exe",Arguments="bridge.mjs --managed",
                    WorkingDirectory=source,UseShellExecute=false,CreateNoWindow=true,
                    RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
                };
                bridge.StartInfo.EnvironmentVariables["GHOST_DESK_PORT"]=port.ToString();
                bridge.StartInfo.EnvironmentVariables.Remove("NODE_OPTIONS");
                bridge.StartInfo.EnvironmentVariables.Remove("NODE_PATH");
                bridge.Start();
                started=true;
                bridge.BeginErrorReadLine();
                var ready=bridge.StandardOutput.ReadLineAsync();
                if(!ready.Wait(TimeSpan.FromSeconds(10)) || ready.Result!="GHOST_DESK_READY")
                    throw new InvalidOperationException("The local bridge could not start on port "+port+". Close any earlier Ghost Desk bridge and try again.");
                icon=Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                menu.Items.Add("Open Ghost Desk",null,(s,e)=>window.Reveal());
                menu.Items.Add("Quit Ghost Desk",null,(s,e)=>window.Close());
                tray.Icon=icon; tray.Text="Ghost Desk"; tray.ContextMenuStrip=menu;
                tray.DoubleClick+=(s,e)=>window.Reveal();
                tray.Visible=true;
                Chat balloon=null;
                window.BalloonAvailable=()=>balloon==null;
                window.ShowBalloon=chat=>{
                    balloon=chat;
                    tray.ShowBalloonTip(10000,chat.title,DockWindow.NotificationLabel(chat),Forms.ToolTipIcon.Info);
                };
                tray.BalloonTipClosed+=(s,e)=>balloon=null;
                tray.BalloonTipClicked+=(s,e)=>{
                    var target=balloon;balloon=null;
                    if(target!=null)window.OpenNotification(target);
                };
                bridge.Exited+=(s,e)=>window.Dispatcher.BeginInvoke(new Action(()=>{
                    if(disposed || window.Dispatcher.HasShutdownStarted)return;
                    MessageBox.Show("The local bridge stopped. Open Ghost Desk again to resume monitoring.","Ghost Desk");
                    window.Close();
                }));
                bridge.EnableRaisingEvents=true;
            } catch {Dispose();throw;}
        }

        public void Dispose() {
            if(disposed)return;
            disposed=true;
            tray.Visible=false;tray.Dispose();menu.Dispose();if(icon!=null)icon.Dispose();
            if(started) {
                bridge.EnableRaisingEvents=false;
                bridge.StandardInput.Close();
                if(!bridge.WaitForExit(2500)) {try{bridge.Kill();}catch(InvalidOperationException){}}
            }
            bridge.Dispose();
        }
    }
}
