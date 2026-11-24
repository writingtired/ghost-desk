using System;
using System.IO;
using System.Reflection;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace GhostDesk {
    internal static class LoginStartup {
        const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run", Entry="GhostDesk.Desktop";
        internal static bool Enabled(){
            using(var key=Registry.CurrentUser.OpenSubKey(RunKey))return key!=null && key.GetValue(Entry)!=null;
        }
        internal static void Set(bool enabled){
            using(var key=Registry.CurrentUser.CreateSubKey(RunKey)){
                if(enabled)key.SetValue(Entry,"\""+Assembly.GetExecutingAssembly().Location+"\"",RegistryValueKind.String);
                else key.DeleteValue(Entry,false);
            }
        }
    }
    public sealed class ScreenSettings {
        public bool rotated {get;set;}
        public int brightness {get;set;}
        public int flash {get;set;}
    }
    public sealed class Diagnostics {
        public string desktop {get;set;}
        public string codex {get;set;}
        public string claude {get;set;}
        public string antigravity {get;set;}
        public int browser {get;set;}
        public bool connected {get;set;}
        public long lastSeen {get;set;}
        public string firmware {get;set;}
        public override string ToString(){
            string seen=lastSeen>0?DateTimeOffset.FromUnixTimeMilliseconds(lastSeen).LocalDateTime.ToString("g"):"No recorded contact";
            return "Ghost Desk "+desktop+"\n\nCodex   ·   "+codex+"\nClaude Code   ·   "+claude+
                "\nAntigravity   ·   "+antigravity+"\nBrowser profiles   ·   "+browser+
                "\n\nDisplay   ·   "+(connected?"Connected":"Offline")+"\nLast seen   ·   "+seen+"\nFirmware   ·   "+firmware;
        }
    }
    sealed partial class DockWindow {
        Window connections;
        internal void ShowConnections(){
            if(connections!=null){connections.Activate();return;}
            var w=new Window{Title="Connections & display · Ghost Desk",Owner=this,Width=435,SizeToContent=SizeToContent.Height,
                WindowStartupLocation=WindowStartupLocation.CenterScreen,Background=Base,ResizeMode=ResizeMode.CanMinimize};
            connections=w;
            var panel=new StackPanel{Margin=new Thickness(20)};w.Content=panel;
            panel.Children.Add(Text("Connection status",21,White));
            var report=Text("Checking…",13,White);report.Margin=new Thickness(0,10,0,12);panel.Children.Add(report);
            var actions=new StackPanel{Orientation=Orientation.Horizontal};panel.Children.Add(actions);
            var refresh=new Button{Content="Refresh",Padding=new Thickness(9,4,9,4)};actions.Children.Add(refresh);
            var copy=new Button{Content="Copy diagnostics",Padding=refresh.Padding,Margin=new Thickness(8,0,0,0)};actions.Children.Add(copy);
            var heading=Text("Board display settings",16,White);heading.Margin=new Thickness(0,18,0,8);panel.Children.Add(heading);
            var controls=new StackPanel{IsEnabled=false};panel.Children.Add(controls);
            var rotated=new CheckBox{Content="Rotate 180°",Foreground=White,Margin=new Thickness(0,0,0,8)};controls.Children.Add(rotated);
            var light=Text("Brightness",13,Muted);controls.Children.Add(light);
            var slider=new Slider{Minimum=10,Maximum=100,TickFrequency=5,IsSnapToTickEnabled=true,Margin=new Thickness(0,3,0,8)};
            System.Windows.Automation.AutomationProperties.SetName(slider,"Brightness");
            slider.ValueChanged+=(s,e)=>light.Text="Brightness   "+Math.Round(slider.Value)+"%";controls.Children.Add(slider);
            controls.Children.Add(Text("Review flash intensity",13,Muted));
            var flash=new ComboBox{ItemsSource=new[]{"Off","Gentle · ghost tile only","Full · entire row"},Margin=new Thickness(0,4,0,8)};
            System.Windows.Automation.AutomationProperties.SetName(flash,"Review flash intensity");controls.Children.Add(flash);
            var apply=new Button{Content="Apply to board",HorizontalAlignment=HorizontalAlignment.Left,Padding=refresh.Padding};controls.Children.Add(apply);
            var feedback=Text("",12,Muted);feedback.TextWrapping=TextWrapping.Wrap;feedback.Margin=new Thickness(0,8,0,0);panel.Children.Add(feedback);
            Func<Task> load=async ()=>{
                refresh.IsEnabled=false;copy.IsEnabled=false;controls.IsEnabled=false;
                try{
                    var d=json.Deserialize<Diagnostics>(await http.GetStringAsync("/v1/diagnostics"));
                    report.Text=d.ToString();copy.IsEnabled=true;
                    var b=json.Deserialize<BoardUpdateState>(await http.GetStringAsync("/v1/board"));
                    if(b.connected && b.screen!=null){
                        rotated.IsChecked=b.screen.rotated;slider.Value=b.screen.brightness;flash.SelectedIndex=b.screen.flash;
                        controls.IsEnabled=true;feedback.Text="";
                    }else feedback.Text=b.connected?"Update the board firmware to enable display settings.":"Power on the paired board, then refresh.";
                }catch(Exception){feedback.Text="Could not reach the desktop service.";report.Text="Desktop service unavailable";}
                finally{refresh.IsEnabled=true;}
            };
            refresh.Click+=async(s,e)=>await load();
            copy.Click+=(s,e)=>{try{Clipboard.SetText(report.Text);feedback.Text="Diagnostics copied.";}catch(Exception){feedback.Text="Clipboard busy. Try again.";}};
            apply.Click+=async(s,e)=>{
                controls.IsEnabled=false;refresh.IsEnabled=false;feedback.Text="Waiting for the board to save…";
                try{
                    var values=new ScreenSettings{rotated=rotated.IsChecked==true,brightness=(int)Math.Round(slider.Value),flash=flash.SelectedIndex};
                    using(var req=new HttpRequestMessage(HttpMethod.Post,"/v1/board/settings")){
                        req.Headers.Add("Origin",http.BaseAddress.GetLeftPart(UriPartial.Authority));
                        req.Content=new StringContent(json.Serialize(values),Encoding.UTF8,"application/json");
                        using(var response=await http.SendAsync(req)){
                            if(!response.IsSuccessStatusCode)throw new IOException(json.Deserialize<BoardUpdateState>(await response.Content.ReadAsStringAsync()).error);
                        }
                    }
                    await load();feedback.Text="Saved on the board.";
                }catch(Exception ex){feedback.Text=ex.Message+" Refresh to try again.";}
                finally{refresh.IsEnabled=true;}
            };
            w.Closed+=(s,e)=>connections=null;w.Loaded+=async(s,e)=>await load();w.Show();
        }

    }
}
