using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Media;

namespace GhostDesk {
    sealed partial class DockWindow {
        static readonly string[] ShortcutNames={"Off","Ctrl + Alt + G","Ctrl + Alt + J","Ctrl + Shift + F9"};
        const int HotkeyId=0x4744;
        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr window,int id,uint modifiers,uint key);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr window,int id);

        bool allChats,alerts,registered,notifying,rowMenuOpen;
        int shortcut=1;
        Chat[] frozenRows;
        internal Func<bool> BalloonAvailable;
        internal Action<Chat> ShowBalloon;

        static bool Current(Chat c) {return c.pin>0||c.review||c.state=="working"||c.state=="attention";}
        static long Now {get {return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}}
        static string Age(Chat c) {
            if(c.stateSince<=0)return "time unknown";
            long seconds=Math.Max(0,(Now-c.stateSince)/1000);
            return seconds<60?"just now":seconds<3600?seconds/60+"m ago":seconds<86400?seconds/3600+"h ago":seconds/86400+"d ago";
        }
        static string Context(Chat c) {return c.provider+" · "+(String.IsNullOrWhiteSpace(c.project)?"Chat "+c.id.Substring(Math.Max(0,c.id.Length-6)):c.project);}
        void AttachPreview(FrameworkElement target,Chat c) {
            var tip=new ToolTip{PlacementTarget=target,MaxWidth=320,Background=Base,Foreground=White,BorderBrush=Line,Padding=new Thickness(12,8,12,8)};
            tip.Opened+=(s,e)=>{
                Chat live=chats.FirstOrDefault(x=>x.id==c.id)??c;
                var content=new StackPanel();
                var title=Text(live.title,14,White);title.FontWeight=FontWeights.SemiBold;title.TextWrapping=TextWrapping.Wrap;content.Children.Add(title);
                content.Children.Add(Text(Context(live),12,Muted));
                content.Children.Add(Text(Label(live)+" · "+Age(live),12,live.state=="attention"?Amber:White));
                tip.Content=content;
            };
            tip.Content=c.title;
            tip.Placement=edge==DockEdge.Top?PlacementMode.Bottom:edge==DockEdge.Bottom?PlacementMode.Top:edge==DockEdge.Left?PlacementMode.Right:PlacementMode.Left;
            target.ToolTip=tip;ToolTipService.SetInitialShowDelay(target,320);
        }
        Chat[] StripSlots() {
            var slots=new Chat[MaxGhosts];
            foreach(var c in chats.Where(c=>c.pin>0 && c.pin<=MaxGhosts))slots[c.pin-1]=c;
            var rest=new System.Collections.Generic.Queue<Chat>(chats.Where(c=>Current(c) && (c.pin==0||c.pin>MaxGhosts)));
            for(int i=0;i<slots.Length && rest.Count>0;i++)if(slots[i]==null)slots[i]=rest.Dequeue();
            return slots.Take(Array.FindLastIndex(slots,c=>c!=null)+1).ToArray();
        }
        Chat[] VisibleRows() {
            if(frozenRows==null)return chats.Where(c=>allChats||Current(c)||settling.ContainsKey(c.id)).ToArray();
            var index=chats.ToDictionary(c=>c.id);
            return frozenRows.Select(c=>index.ContainsKey(c.id)?index[c.id]:c).ToArray();
        }
        void AddFold() {
            int quiet=chats.Count(c=>!Current(c));
            string total=chats.Length+(chats.Length==1?" chat":" chats");
            if(quiet==0 && !allChats){
                var caption=Text(total,11,Muted);caption.Margin=new Thickness(5,8,5,0);footer.Child=caption;return;
            }
            string label=allChats?"Show current work":"+"+quiet+" other chat"+(quiet==1?"":"s");
            var fold=ButtonOf(label);fold.Padding=new Thickness(5,8,4,4);
            var grid=new DockPanel();
            var end=Text(quiet+"   "+(allChats?"⌄":"›"),14,White);
            DockPanel.SetDock(end,Dock.Right);grid.Children.Add(end);
            var left=new StackPanel{Orientation=Orientation.Horizontal};
            left.Children.Add(Text(allChats?"Current work":"Other chats",13,White));
            var captionTotal=Text(total+" total",11,Muted);captionTotal.Margin=new Thickness(12,0,0,0);
            left.Children.Add(captionTotal);grid.Children.Add(left);fold.Content=grid;
            fold.Click+=(s,e)=>{allChats=!allChats;frozenRows=null;Draw();Place();};footer.Child=fold;
        }
        string ControlsFile {get{return Path.ChangeExtension(prefs,"controls");}}
        void LoadControls() {
            try {
                var settings=File.ReadAllLines(ControlsFile);
                int selected;
                if(settings.Length>=2 && Int32.TryParse(settings[0],out selected) && selected>=0 && selected<ShortcutNames.Length) {
                    shortcut=selected;alerts=settings[1]=="on";
                }
            } catch(IOException) {} catch(UnauthorizedAccessException) {}
            scroll.MouseEnter+=(s,e)=>{if(expanded && frozenRows==null)frozenRows=VisibleRows();};
            scroll.MouseLeave+=(s,e)=>{if(frozenRows!=null && !rowMenuOpen){frozenRows=null;Dispatcher.BeginInvoke(new Action(()=>{if(!closed){Draw();Place();}}));}};
        }
        void SaveControls() {
            try {Directory.CreateDirectory(Path.GetDirectoryName(prefs));File.WriteAllLines(ControlsFile,new[]{shortcut.ToString(),alerts?"on":"off"});}
            catch(IOException){Message("Could not save these preferences.");}catch(UnauthorizedAccessException){Message("Could not save these preferences.");}
        }
        void ReleaseHotkey() {if(registered){UnregisterHotKey(hwnd,HotkeyId);registered=false;}}
        bool SetHotkey(int choice) {
            if(choice==0)return true;
            registered=RegisterHotKey(hwnd,HotkeyId,(uint)(0x4000|(choice==3?6:3)),(uint)(choice==3?0x78:choice==2?'J':'G'));
            return registered;
        }
        void InitHotkey() {
            if(!managed)return;
            HwndSource.FromHwnd(hwnd).AddHook(OnMessage);
            if(!SetHotkey(shortcut))Message("Shortcut in use. Choose another under Dock options.");
        }
        IntPtr OnMessage(IntPtr h,int msg,IntPtr w,IntPtr l,ref bool handled) {
            if(msg==0x0312 && w.ToInt32()==HotkeyId) {handled=true;Dispatcher.BeginInvoke(new Action(Jump));}
            return IntPtr.Zero;
        }
        async void Jump() {
            await Poll();
            var next=chats.Where(c=>c.state=="attention").OrderBy(c=>c.stateSince).ThenBy(c=>c.id).FirstOrDefault();
            if(next==null)Reveal();else await Open(next);
        }
        void AddControls(ContextMenu menu) {
            var preview=new MenuItem{Header="ESP32 display preview"};preview.Click+=(s,e)=>{
                try {Process.Start(new ProcessStartInfo(new Uri(http.BaseAddress,"esp32").AbsoluteUri){UseShellExecute=true});}
                catch(Exception){Message("Open "+new Uri(http.BaseAddress,"esp32")+" for the display preview.");}
            };menu.Items.Add(preview);
            var update=new MenuItem{Header="Update display…"};
            update.Click+=(s,e)=>ShowDisplayUpdater();menu.Items.Add(update);
            if(!managed)return;
            var keys=new MenuItem{Header="Jump to oldest wait"};
            for(int i=0;i<ShortcutNames.Length;i++){
                int pick=i;var option=new MenuItem{Header=ShortcutNames[i],IsChecked=i==0?!registered:registered&&i==shortcut};
                option.Click+=(s,e)=>{
                    int old=shortcut;ReleaseHotkey();
                    if(SetHotkey(pick)){shortcut=pick;SaveControls();Message(null);}
                    else {SetHotkey(old);Reveal();Message("That shortcut is in use. Choose another.");}
                };keys.Items.Add(option);
            }
            menu.Items.Add(keys);
            var notify=new MenuItem{Header="Notify after 30s waiting",IsCheckable=true,IsChecked=alerts};
            notify.Click+=(s,e)=>{alerts=notify.IsChecked;SaveControls();};menu.Items.Add(notify);
        }
        async Task<bool> Act(Chat c,string op,bool value) {
            try {
                using(var request=new HttpRequestMessage(HttpMethod.Post,"/v1/chat")) {
                    request.Headers.Add("Origin",http.BaseAddress.GetLeftPart(UriPartial.Authority));
                    request.Content=new StringContent(json.Serialize(new{id=c.id,op=op,value=value,since=c.stateSince}),Encoding.UTF8,"application/json");
                    using(var response=await http.SendAsync(request))return response.IsSuccessStatusCode;
                }
            }catch(HttpRequestException){return false;}catch(OperationCanceledException){return false;}
        }
        void AddAction(ContextMenu menu,Chat c,string label,string op,bool value) {
            var item=new MenuItem{Header=label};item.Click+=async(s,e)=>{
                if(!await Act(c,op,value))Message("This chat changed. Check its current status.");
                frozenRows=null;await Poll();
            };menu.Items.Add(item);
        }
        void AttachChatMenu(Button b,Chat c) {
            var menu=new ContextMenu();
            if(c.review)AddAction(menu,c,"Mark reviewed","review",false);
            AddAction(menu,c,c.pin>0?"Unpin chat":"Pin chat","pin",c.pin==0);
            AddAction(menu,c,c.muted?"Unmute alerts":"Mute alerts","mute",!c.muted);
            menu.Opened+=(s,e)=>rowMenuOpen=true;
            menu.Closed+=(s,e)=>{rowMenuOpen=false;if(!scroll.IsMouseOver)frozenRows=null;signature=null;};
            b.ContextMenu=menu;
        }
        async Task CheckNotifications() {
            if(!alerts||notifying||BalloonAvailable==null||!BalloonAvailable())return;
            var c=chats.Where(x=>x.state=="attention"&&!x.muted&&!x.notified&&x.stateSince>0&&Now-x.stateSince>=30000)
                .OrderBy(x=>x.stateSince).FirstOrDefault();
            if(c==null)return;
            notifying=true;
            try {if(await Act(c,"notify",true) && !closed && alerts)ShowBalloon(c);}
            finally {notifying=false;}
        }
        internal async void OpenNotification(Chat target) {
            await Poll();
            var chat=chats.FirstOrDefault(c=>c.id==target.id && c.state=="attention" && c.stateSince==target.stateSince);
            if(chat!=null)await Open(chat);else Reveal();
        }
        internal static string NotificationLabel(Chat c) {return Label(c)+" · "+Context(c);}
    }
}
