using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.Win32;

namespace GhostDesk {
    sealed class BoardUpdateState {
        public bool connected { get; set; }
        public bool capable { get; set; }
        public string phase { get; set; }
        public string message { get; set; }
        public string build { get; set; }
        public string error { get; set; }
        public int percent { get; set; }
    }
    sealed partial class DockWindow {
        Window updateWindow;
        internal void ShowDisplayUpdater() {
            if(updateWindow!=null){updateWindow.Activate();return;}
            var window=new Window {Title="Update display · Ghost Desk",Width=440,SizeToContent=SizeToContent.Height,
                ResizeMode=ResizeMode.NoResize,WindowStartupLocation=WindowStartupLocation.CenterScreen,Background=Base,Owner=this};
            updateWindow=window;
            var panel=new StackPanel{Margin=new Thickness(22)};
            window.Content=panel;
            panel.Children.Add(Text("Update display",22,White));
            var status=Text("Checking the paired display…",14,Muted);
            status.TextWrapping=TextWrapping.Wrap;status.Margin=new Thickness(0,10,0,10);panel.Children.Add(status);
            var bar=new ProgressBar{Minimum=0,Maximum=100,Height=7,Margin=new Thickness(0,0,0,12)};panel.Children.Add(bar);
            var fileLabel=Text("Choose a Ghost Desk .ota.bin firmware file.",13,White);
            fileLabel.TextWrapping=TextWrapping.Wrap;panel.Children.Add(fileLabel);
            var actions=new StackPanel{Orientation=Orientation.Horizontal,Margin=new Thickness(0,12,0,0)};
            panel.Children.Add(actions);
            var pick=new Button{Content="Choose firmware…",Padding=new Thickness(10,5,10,5)};
            var install=new Button{Content="Update display",Padding=new Thickness(10,5,10,5),Margin=new Thickness(8,0,0,0),IsEnabled=false};
            actions.Children.Add(pick);actions.Children.Add(install);
            string path=null;bool refreshing=false,sending=false,ready=false;
            Func<Task> refresh=async ()=>{
                if(refreshing||sending||updateWindow!=window)return;
                refreshing=true;
                try{
                    var state=json.Deserialize<BoardUpdateState>(await http.GetStringAsync("/v1/board"));
                    bool busy=state.phase=="queued"||state.phase=="transferring"||state.phase=="rebooting";
                    ready=state.connected && state.capable && !busy;
                    status.Text=busy?state.message:!state.connected?"Waiting for your paired display on Wi-Fi.":
                        !state.capable?"Enable wireless updates once over USB using option 4 in the board kit.":
                        !String.IsNullOrEmpty(state.message)?state.message:"Display connected and ready for a wireless update.";
                    bar.Value=state.percent;pick.IsEnabled=!busy;
                }catch(Exception){ready=false;status.Text="Waiting for the Ghost Desk desktop service.";}
                finally{refreshing=false;install.IsEnabled=ready && path!=null && !sending;}
            };
            pick.Click+=(s,e)=>{
                var dialog=new OpenFileDialog{Title="Choose Ghost Desk firmware",Filter="Ghost Desk firmware (*.ota.bin)|*.ota.bin"};
                if(dialog.ShowDialog(window)==true){path=dialog.FileName;fileLabel.Text=Path.GetFileName(path);install.IsEnabled=ready;}
            };
            install.Click+=async(s,e)=>{
                if(path==null||sending||!ready)return;
                sending=true;install.IsEnabled=false;pick.IsEnabled=false;
                try{
                    if(new FileInfo(path).Length>0x140000)throw new IOException("The file exceeds the display's firmware slot.");
                    using(var request=new HttpRequestMessage(HttpMethod.Post,"/v1/board/update")){
                        request.Headers.Add("Origin",http.BaseAddress.GetLeftPart(UriPartial.Authority));
                        request.Content=new ByteArrayContent(File.ReadAllBytes(path));
                        request.Content.Headers.ContentType=new MediaTypeHeaderValue("application/octet-stream");
                        using(var response=await http.SendAsync(request)){
                            if(!response.IsSuccessStatusCode){
                                var result=json.Deserialize<BoardUpdateState>(await response.Content.ReadAsStringAsync());
                                throw new IOException(result.error??"The update could not start.");
                            }
                        }
                    }
                }catch(Exception ex){fileLabel.Text=ex.Message;path=null;}
                finally{sending=false;pick.IsEnabled=true;}
                await refresh();
            };
            var timer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(1)};
            timer.Tick+=async(s,e)=>await refresh();
            window.Closed+=(s,e)=>{timer.Stop();updateWindow=null;};
            window.Loaded+=async(s,e)=>{timer.Start();await refresh();};
            window.Show();
        }
    }
}
