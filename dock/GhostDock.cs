using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using Screen = System.Windows.Forms.Screen;

namespace GhostDesk {
    public sealed class Chat {
        public string id { get; set; }
        public string title { get; set; }
        public string provider { get; set; }
        public string state { get; set; }
        public string project { get; set; }
        public string reason { get; set; }
        public long stateSince { get; set; }
        public bool review { get; set; }
        public int pin { get; set; }
        public bool muted { get; set; }
        public bool notified { get; set; }
        public int hue { get; set; }
        public long updatedAt { get; set; }
    }
    public sealed class Snapshot {
        public int version { get; set; }
        public Chat[] sessions { get; set; }
    }
    public sealed class FocusResult {
        public bool ok { get; set; }
        public string message { get; set; }
    }

    static class Native {
        [DllImport("user32.dll")] internal static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
        [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(System.Drawing.Point point,uint flags);
        [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor,int type,out uint x,out uint y);
        internal static double Scale(Screen target,IntPtr hwnd) {
            uint x,y;
            if(GetDpiForMonitor(MonitorFromPoint(target.Bounds.Location,2),0,out x,out y)==0 && x>0) return x/96.0;
            return Math.Max(96,GetDpiForWindow(hwnd))/96.0;
        }
    }

    sealed class Ghost : FrameworkElement {
        sealed class SpriteAtlas {
            public string[] body {get;set;}
            public Dictionary<string,object[][]> faces {get;set;}
        }
        static readonly SpriteAtlas Atlas=LoadAtlas();
        static SpriteAtlas LoadAtlas() {
            using(var stream=typeof(Ghost).Assembly.GetManifestResourceStream("GhostSprites"))
            using(var reader=new StreamReader(stream))return new JavaScriptSerializer().Deserialize<SpriteAtlas>(reader.ReadToEnd());
        }
        readonly Brush body;
        readonly string state;
        internal Ghost(Chat chat, int size) {
            Width=Height=size; state=chat.review?"review":chat.state; RenderOptions.SetEdgeMode(this,EdgeMode.Aliased);
            body=state=="unknown" ? Brushes.SlateGray : Hue(chat.hue);
            if (state=="stopped") Opacity=.55;
            IsHitTestVisible=false;
            if (!SystemParameters.ClientAreaAnimation) return;
            if (state=="working" || state=="attention") {
                var shift=new TranslateTransform();
                RenderTransform=shift;
                var animation=new DoubleAnimation(0,state=="working"?-3:2,
                    TimeSpan.FromMilliseconds(state=="working"?480:240)) {
                    AutoReverse=true,RepeatBehavior=RepeatBehavior.Forever,
                    EasingFunction=new SineEase {EasingMode=EasingMode.EaseInOut}
                };
                shift.BeginAnimation(state=="working"?TranslateTransform.YProperty:TranslateTransform.XProperty,animation);
            }
        }
        static Brush Hue(int hue) {
            // HSL at the same saturation and lightness as the web panel.
            double h=((hue%360+360)%360)/60.0, c=.4368, x=c*(1-Math.Abs(h%2-1)), m=.72-c/2;
            double[] rgb=h<1?new[]{c,x,0}:h<2?new[]{x,c,0}:h<3?new[]{0,c,x}:h<4?new[]{0,x,c}:h<5?new[]{x,0,c}:new[]{c,0,x};
            var brush=new SolidColorBrush(Color.FromRgb((byte)((rgb[0]+m)*255),(byte)((rgb[1]+m)*255),(byte)((rgb[2]+m)*255)));
            brush.Freeze(); return brush;
        }
        protected override void OnRender(DrawingContext dc) {
            double unit=Width/16;
            for(int y=0;y<Atlas.body.Length;y++) {
                for(int x=0;x<16;) {
                    if(Atlas.body[y][x]!='#') {x++; continue;}
                    int start=x++;
                    while(x<16 && Atlas.body[y][x]=='#') x++;
                    dc.DrawRectangle(body,null,new Rect(start*unit,y*unit,(x-start)*unit,unit));
                }
            }
            object[][] face;
            if(!Atlas.faces.TryGetValue(state??"unknown",out face))face=Atlas.faces["unknown"];
            foreach(var mark in face) {
                string ink=(string)mark[4];
                dc.DrawRectangle(ink=="ink"?Brushes.MidnightBlue:ink=="amber"?Brushes.Gold:Brushes.White,null,
                    new Rect((int)mark[0]*unit,(int)mark[1]*unit,(int)mark[2]*unit,(int)mark[3]*unit));
            }
        }
    }

    sealed partial class DockWindow : Window {
        const int RailWidth=42, FullWidth=390, MaxGhosts=9;
        static readonly Brush Base=Ink("#12171c"), Line=Ink("#384248"), White=Ink("#eef3ef"),
            Muted=Ink("#b1bcc0"), Hover=Ink("#273238"), Lime=Ink("#c0f49e"), Amber=Ink("#ffcd80");
        static readonly Brush Clay=Ink("#533b32"), Blue=Ink("#33415b"), Sage=Ink("#2c493e");
        static readonly string[] Order={"attention","working","finished","stopped","available","unknown"};
        static readonly string[] Labels={"Needs you","Working","Turn ended","Stopped","Available","Status unknown"};
        readonly HttpClient http;
        readonly JavaScriptSerializer json=new JavaScriptSerializer();
        readonly DispatcherTimer poll=new DispatcherTimer(), slide=new DispatcherTimer();
        readonly Stopwatch elapsed=new Stopwatch();
        readonly Border frame=new Border();
        readonly Grid surface=new Grid(), detail=new Grid();
        readonly Button rail=ButtonOf("Expand Ghost Desk"), hide=ButtonOf("Hide"), options=ButtonOf("Dock options");
        readonly StackPanel railItems=new StackPanel(), rows=new StackPanel();
        readonly ScrollViewer scroll=new ScrollViewer();
        readonly TextBlock count=Text("",12,Muted), notice=Text("",12,Amber);
        readonly string prefs;
        Screen screen;
        bool expanded,busy,opening,closed,connected;
        DockEdge edge=DockEdge.Right;
        string displayName;
        double anchor=.5,grabX,grabY;
        FrameworkElement pressed;
        System.Drawing.Point pressPoint;
        bool dragging;
        string signature=null;
        Chat[] chats=new Chat[0];
        double spread,from,to;
        IntPtr hwnd;
        static Brush Ink(string hex) {
            var brush=(SolidColorBrush)new BrushConverter().ConvertFromString(hex);
            brush.Freeze(); return brush;
        }
        static TextBlock Text(string value,double size,Brush color) {
            return new TextBlock {Text=value,FontSize=size,Foreground=color,VerticalAlignment=VerticalAlignment.Center,
                                  TextTrimming=TextTrimming.CharacterEllipsis};
        }
        static Button ButtonOf(string name, Brush highlight=null) {
            var b=new Button {Focusable=true,Cursor=System.Windows.Input.Cursors.Hand,Foreground=White,
                Background=Brushes.Transparent,BorderThickness=new Thickness(0),Padding=new Thickness(0),
                HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Center};
            AutomationProperties.SetName(b,name);
            var factory=new FrameworkElementFactory(typeof(Border));
            factory.Name="bg";
            factory.SetValue(Border.BackgroundProperty,new TemplateBindingExtension(Control.BackgroundProperty));
            var presenter=new FrameworkElementFactory(typeof(ContentPresenter));
            presenter.SetValue(ContentPresenter.MarginProperty,new TemplateBindingExtension(Control.PaddingProperty));
            factory.AppendChild(presenter);
            var template=new ControlTemplate(typeof(Button)) {VisualTree=factory};
            foreach(var property in new[]{UIElement.IsMouseOverProperty,UIElement.IsKeyboardFocusedProperty}) {
                var trigger=new Trigger {Property=property,Value=true};
                trigger.Setters.Add(new Setter(Border.BackgroundProperty,highlight??Hover,"bg"));
                template.Triggers.Add(trigger);
            }
            b.Template=template;
            return b;
        }
        static int Rank(Chat s) {int i=Array.IndexOf(Order,s.state); return i<0?5:i;}
        static string Label(Chat s) {
            if(s.review)return "Ready to review";
            if(s.state=="attention")return s.reason=="approval"?"Approval requested":s.reason=="question"?"Question waiting":"Needs you";
            return Labels[Rank(s)];
        }
        static Brush ProviderTint(string provider) {
            switch(provider) {
                case "Claude": case "Claude Code": return Clay;
                case "Gemini": case "Antigravity": return Blue;
                case "ChatGPT": case "Codex": return Sage;
                default: return Line;
            }
        }
        Border GhostTile(Chat chat,bool compact) {
            var tile=new Border {
                Width=compact?34:39, Height=compact?28:37, Background=ProviderTint(chat.provider),
                CornerRadius=new CornerRadius(6), HorizontalAlignment=HorizontalAlignment.Center,
                VerticalAlignment=VerticalAlignment.Center,
                Child=new Ghost(chat,compact?21:25) {HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center}
            };
            if(compact) AttachPreview(tile,chat);
            return tile;
        }

        readonly bool managed;
        internal DockWindow(int port,bool managed=false) {
            this.managed=managed;
            Title="Ghost Desk – edge dock";
            AutomationProperties.SetName(this,"Ghost Desk edge dock");
            http=new HttpClient(new HttpClientHandler{UseProxy=false}) {BaseAddress=new Uri("http://127.0.0.1:"+port),Timeout=TimeSpan.FromSeconds(20)};
            prefs=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ghost Desk","dock-"+port+".txt");
            screen=Screen.FromPoint(System.Windows.Forms.Cursor.Position);
            displayName=screen.DeviceName;
            try {
                var saved=File.ReadAllLines(prefs);
                DockEdge savedEdge;
                if(saved.Length>=2 && Enum.TryParse(saved[0],true,out savedEdge) && Enum.IsDefined(typeof(DockEdge),savedEdge)) {
                    edge=savedEdge;displayName=saved[1];
                    double fraction;
                    if(saved.Length>=3 && double.TryParse(saved[2],NumberStyles.Float,CultureInfo.InvariantCulture,out fraction) && fraction>=0 && fraction<=1) anchor=fraction;
                }
            } catch(IOException) {} catch(UnauthorizedAccessException) {}
            WindowStyle=WindowStyle.None; AllowsTransparency=true; Background=Brushes.Transparent;
            ResizeMode=ResizeMode.NoResize; Topmost=true; ShowInTaskbar=false; ShowActivated=false;
            Width=RailWidth; Height=76; WindowStartupLocation=WindowStartupLocation.Manual;
            FontFamily=new FontFamily("Inter, Segoe UI"); UseLayoutRounding=true;
            frame.Background=Base;frame.BorderBrush=Line;frame.BorderThickness=new Thickness(1);frame.Child=surface;
            Content=frame; surface.ClipToBounds=true;
            LoadControls();BuildDetail();
            surface.Children.Add(detail);surface.Children.Add(rail);detail.Visibility=Visibility.Collapsed;
            rail.Content=railItems;rail.ToolTip="Open Ghost Desk";rail.Click+=(s,e)=>Toggle(true);
            EnableDrag(rail);
            rail.ContextMenuOpening+=(s,e)=>rail.ContextMenu=Menu();
            rail.ContextMenu=Menu();
            PreviewKeyDown+=(s,e)=>{
                if(e.Key!=Key.Escape)return;
                if(pressed!=null) CancelDrag(); else if(expanded) Toggle(false); else return;
                e.Handled=true;
            };
            SourceInitialized+=(s,e)=>{hwnd=new WindowInteropHelper(this).Handle;InitHotkey();Place();};
            Loaded+=async(s,e)=>{Draw();Place();poll.Start();await Poll();};
            poll.Interval=TimeSpan.FromMilliseconds(2100);poll.Tick+=async(s,e)=>await Poll();
            slide.Interval=TimeSpan.FromMilliseconds(16);
            slide.Tick+=(s,e)=>{
                double t=Math.Min(1,elapsed.Elapsed.TotalMilliseconds/165.0);
                spread=from+(to-from)*(1-Math.Pow(1-t,3)); Place();
                if(t>=1) slide.Stop();
            };
            Closed+=(s,e)=>{closed=true;ReleaseHotkey();poll.Stop();slide.Stop();http.Dispose();};
        }
        void BuildDetail() {
            detail.Margin=new Thickness(14,14,14,10);
            for(int i=0;i<4;i++) detail.RowDefinitions.Add(new RowDefinition {Height=i==2?new GridLength(1,GridUnitType.Star):GridLength.Auto});
            var header=new DockPanel();
            hide.Content=Text("Hide",13,White);hide.Padding=new Thickness(8,4,8,4);hide.Click+=(s,e)=>Toggle(false);
            DockPanel.SetDock(hide,Dock.Right);header.Children.Add(hide);
            options.Content=Text("···",19,Muted);options.Padding=new Thickness(8,0,8,0);options.ToolTip="Dock options";
            options.Click+=(s,e)=>{var m=Menu();m.PlacementTarget=options;m.Placement=PlacementMode.Bottom;m.IsOpen=true;};
            DockPanel.SetDock(options,Dock.Right);header.Children.Add(options);
            var heading=Text("Ghost Desk",21,White);heading.FontWeight=FontWeights.SemiBold;
            var grip=new Border {Background=Brushes.Transparent,Child=heading,Cursor=Cursors.SizeAll,ToolTip="Drag to any screen edge"};
            EnableDrag(grip);header.Children.Add(grip);
            detail.Children.Add(header);
            count.Margin=new Thickness(0,4,0,12);Grid.SetRow(count,1);detail.Children.Add(count);
            scroll.VerticalScrollBarVisibility=ScrollBarVisibility.Auto;scroll.HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled;
            scroll.Content=rows;Grid.SetRow(scroll,2);detail.Children.Add(scroll);
            notice.TextWrapping=TextWrapping.Wrap;notice.Visibility=Visibility.Collapsed;notice.Margin=new Thickness(0,8,0,0);
            Grid.SetRow(notice,3);detail.Children.Add(notice);
        }
        ContextMenu Menu() {
            var menu=new ContextMenu();
            foreach(DockEdge choice in Enum.GetValues(typeof(DockEdge))) {
                var item=new MenuItem {Header="Dock on "+choice.ToString().ToLowerInvariant(),IsChecked=edge==choice};
                item.Click+=(s,e)=>{edge=choice;displayName=screen.DeviceName;Save();Draw();Place();};
                menu.Items.Add(item);
            }
            if(Screen.AllScreens.Length>1) {
                var displays=new MenuItem {Header="Move to display"};int number=0;
                foreach(var display in Screen.AllScreens) {
                    var target=display;
                    var item=new MenuItem {Header="Display "+(++number)+(display.Primary?" (primary)":""),
                        IsChecked=display.DeviceName==screen.DeviceName};
                    item.Click+=(s,e)=>{screen=target;displayName=target.DeviceName;Save();Place();};displays.Items.Add(item);
                }
                menu.Items.Add(displays);
            }
            menu.Items.Add(new Separator());
            AddControls(menu);
            if(managed) {
                var hideToTray=new MenuItem{Header="Hide to tray"};hideToTray.Click+=(s,e)=>Hide();menu.Items.Add(hideToTray);
            }
            var close=new MenuItem{Header=managed?"Quit Ghost Desk":"Close dock"};close.Click+=(s,e)=>Close();menu.Items.Add(close); return menu;
        }
        void Save() {
            try {Directory.CreateDirectory(Path.GetDirectoryName(prefs));File.WriteAllLines(prefs,new[]{edge.ToString().ToLowerInvariant(),displayName,anchor.ToString("R",CultureInfo.InvariantCulture)});}
            catch(IOException) {Message("Could not save dock position.");} catch(UnauthorizedAccessException) {Message("Could not save dock position.");}
        }
        void Toggle(bool open) {
            expanded=open;if(!open)frozenRows=null;Draw();rail.Visibility=open?Visibility.Collapsed:Visibility.Visible;detail.Visibility=open?Visibility.Visible:Visibility.Collapsed;
            from=spread;to=open?1:0;
            if(SystemParameters.ClientAreaAnimation) {elapsed.Restart();slide.Start();}
            else {spread=to;Place();}
            if(open) hide.Focus();else rail.Focus();
        }
        void EnableDrag(FrameworkElement handle) {
            handle.PreviewMouseLeftButtonDown+=(s,e)=>{
                if(pressed!=null || e.ButtonState!=MouseButtonState.Pressed)return;
                var point=e.GetPosition(this);
                grabX=Math.Max(0,Math.Min(1,point.X/Math.Max(1,ActualWidth)));
                grabY=Math.Max(0,Math.Min(1,point.Y/Math.Max(1,ActualHeight)));
                pressPoint=System.Windows.Forms.Cursor.Position;
                if(!handle.CaptureMouse())return;
                pressed=handle;dragging=false;
                if(handle==rail)rail.Focus();else Activate();
                e.Handled=true;
            };
            handle.PreviewMouseMove+=(s,e)=>{
                if(pressed!=handle)return;
                if(e.LeftButton!=MouseButtonState.Pressed){CancelDrag();return;}
                var point=System.Windows.Forms.Cursor.Position;
                if(!dragging) {
                    double scale=Native.Scale(screen,hwnd);
                    if(Math.Abs(point.X-pressPoint.X)<SystemParameters.MinimumHorizontalDragDistance*scale &&
                       Math.Abs(point.Y-pressPoint.Y)<SystemParameters.MinimumVerticalDragDistance*scale)return;
                    dragging=true;slide.Stop();spread=expanded?1:0;
                }
                Place();e.Handled=true;
            };
            handle.PreviewMouseLeftButtonUp+=(s,e)=>{
                if(pressed!=handle)return;
                bool moved=dragging;
                var point=System.Windows.Forms.Cursor.Position;
                if(moved) {
                    screen=Screen.FromPoint(point);displayName=screen.DeviceName;
                    var targetEdge=DockPlacement.Nearest(screen.WorkingArea,point,edge);
                    // Keep the original point on the rail under the pointer, even when rotating it.
                    bool horizontalGrab=DockPlacement.Horizontal(expanded?targetEdge:edge);
                    edge=targetEdge;
                    anchor=DockPlacement.Anchor(edge,screen.WorkingArea,point,PixelSize(screen),horizontalGrab?grabX:grabY);
                }
                pressed=null;dragging=false;handle.ReleaseMouseCapture();e.Handled=true;
                if(moved) {Draw();Place();Save();}
                else if(handle==rail && rail.IsMouseOver) Toggle(true);
            };
            handle.LostMouseCapture+=(s,e)=>{if(pressed==handle)CancelDrag();};
        }
        void CancelDrag() {
            var handle=pressed;pressed=null;dragging=false;
            if(handle!=null && handle.IsMouseCaptured)handle.ReleaseMouseCapture();
            Place();
        }
        internal void Reveal() {if(!closed){Show();Activate();Toggle(true);}}
        System.Drawing.Size PixelSize(Screen target) {
            var area=target.WorkingArea;
            double dpi=Native.Scale(target,hwnd);
            var slots=StripSlots();int shown=slots.Count(c=>c!=null);
            int visible=Math.Max(slots.Length,1);
            bool horizontal=DockPlacement.Horizontal(edge);
            double length=30+visible*(horizontal?36:30)+(chats.Length>shown?32:0);
            double thinWidth=horizontal?length:RailWidth,thinHeight=horizontal?RailWidth:length;
            double fullHeight=Math.Min(540,Math.Max(166,108+VisibleRows().Length*54+(chats.Any(c=>!Current(c))?34:0)+(notice.Visibility==Visibility.Visible?50:0)));
            int w=Math.Min(area.Width,(int)Math.Round((thinWidth+(FullWidth-thinWidth)*spread)*dpi));
            int h=Math.Min(area.Height,(int)Math.Round((thinHeight+(fullHeight-thinHeight)*spread)*dpi));
            return new System.Drawing.Size(w,h);
        }
        void Place() {
            if(hwnd==IntPtr.Zero || closed) return;
            var cursor=System.Windows.Forms.Cursor.Position;
            screen=dragging?Screen.FromPoint(cursor):Screen.AllScreens.FirstOrDefault(s=>s.DeviceName==displayName)??Screen.PrimaryScreen;
            var size=PixelSize(screen);
            var bounds=DockPlacement.Bounds(edge,screen.WorkingArea,size,anchor);
            if(dragging) bounds.Location=new System.Drawing.Point(cursor.X-(int)Math.Round(size.Width*grabX),cursor.Y-(int)Math.Round(size.Height*grabY));
            var corner=edge==DockEdge.Top?new CornerRadius(0,0,12,12):
                       edge==DockEdge.Bottom?new CornerRadius(12,12,0,0):
                       edge==DockEdge.Left?new CornerRadius(0,12,12,0):new CornerRadius(12,0,0,12);
            if(frame.CornerRadius!=corner) frame.CornerRadius=corner;
            // Keep the shell work area usable everywhere outside this exact window.
            Native.SetWindowPos(hwnd,IntPtr.Zero,bounds.X,bounds.Y,bounds.Width,bounds.Height,0x0014);
        }
        async Task Poll() {
            if(busy||closed)return; busy=true;
            try {
                var payload=await http.GetStringAsync("/v1/sessions");
                if(closed)return;
                var snap=json.Deserialize<Snapshot>(payload);
                if(snap==null || snap.version!=1 || snap.sessions==null) throw new FormatException();
                chats=snap.sessions.Where(s=>s!=null && !String.IsNullOrEmpty(s.id))
                    .OrderBy(s=>s.pin>0?0:1).ThenBy(s=>s.pin).ThenBy(Rank)
                    .ThenByDescending(s=>s.review).ThenByDescending(s=>s.updatedAt).ThenBy(s=>s.id).ToArray();
                connected=true;
            } catch(Exception) {if(closed)return;connected=false;chats=new Chat[0];}
            finally {busy=false;}
            string next=json.Serialize(new object[]{connected,chats.Select(s=>new object[]{s.id,s.title,s.provider,s.state,s.hue,s.reason,s.review,s.pin,s.project,s.muted,s.stateSince,s.state=="attention"?Age(s):""}).ToArray()});
            if(next!=signature && !rowMenuOpen && Mouse.LeftButton!=MouseButtonState.Pressed) {signature=next;Draw();}
            await CheckNotifications();
            Place();
        }
        void Draw() {
            string focused=(System.Windows.Input.Keyboard.FocusedElement as Button ?? rail).Tag as string;
            double offset=scroll.VerticalOffset;
            railItems.Children.Clear();rows.Children.Clear();
            bool horizontal=DockPlacement.Horizontal(edge);
            railItems.Orientation=horizontal?Orientation.Horizontal:Orientation.Vertical;
            railItems.HorizontalAlignment=HorizontalAlignment.Center;
            railItems.VerticalAlignment=VerticalAlignment.Center;
            string chevron=edge==DockEdge.Top?"⌄":edge==DockEdge.Bottom?"⌃":edge==DockEdge.Left?"›":"‹";
            var arrow=Text(chevron,16,Muted);arrow.HorizontalAlignment=HorizontalAlignment.Center;
            if(horizontal)arrow.Margin=new Thickness(3,0,5,0);
            railItems.Children.Add(arrow);
            var strip=StripSlots();int shown=strip.Count(c=>c!=null);
            foreach(var chat in strip) {
                var icon=chat==null?new Border{Width=34,Height=28}:GhostTile(chat,true);icon.Margin=horizontal?new Thickness(1,0,1,0):new Thickness(0,1,0,1);
                railItems.Children.Add(icon);
            }
            if(shown==0) railItems.Children.Add(new Ghost(new Chat{state=chats.Length==0?"unknown":"finished",hue=158},22){HorizontalAlignment=HorizontalAlignment.Center});
            if(chats.Length>shown) {
                var more=Text("+"+(chats.Length-shown),11,Muted);more.HorizontalAlignment=HorizontalAlignment.Center;railItems.Children.Add(more);
            }
            int work=chats.Count(s=>s.state=="working"), attention=chats.Count(s=>s.state=="attention");
            string summary=connected?chats.Length+" chats · "+work+" working · "+attention+" need you":"PC bridge offline";
            count.Text=summary;rail.ToolTip="Click to open · Drag to any screen edge · "+summary;AutomationProperties.SetHelpText(rail,summary);
            if(chats.Length>0 && VisibleRows().Length==0)rows.Children.Add(Text("All quiet.",14,Muted));
            if(chats.Length==0) rows.Children.Add(Text(connected?"No recent chats":"Waiting for the PC bridge…",14,Muted));
            foreach(Chat chat in VisibleRows()) {
                var tint=ProviderTint(chat.provider);
                var wash=tint.Clone();wash.Opacity=.5;wash.Freeze();
                var b=ButtonOf("Open "+chat.provider+" chat, "+chat.title+", "+Label(chat),tint);
                b.IsEnabled=chats.Any(c=>c.id==chat.id);b.Background=wash;b.Tag=chat.id;b.Padding=new Thickness(5,0,6,0);
                AttachPreview(b,chat);AttachChatMenu(b,chat);
                var line=new DockPanel{Height=53,LastChildFill=true};
                var icon=GhostTile(chat,false);icon.Margin=new Thickness(0,0,10,0);
                DockPanel.SetDock(icon,Dock.Left);line.Children.Add(icon);
                var status=Text(Label(chat)+(chat.state=="attention"?"\n"+Age(chat):""),11,chat.state=="attention"?Amber:chat.review?Lime:Muted);
                status.TextAlignment=TextAlignment.Right;status.Margin=new Thickness(7,0,0,0);
                DockPanel.SetDock(status,Dock.Right);line.Children.Add(status);
                var copy=new StackPanel{VerticalAlignment=VerticalAlignment.Center};
                var title=Text(chat.title,14,White);title.FontWeight=FontWeights.SemiBold;copy.Children.Add(title);
                copy.Children.Add(Text((chat.pin>0?"★  ":"")+Context(chat),12,Muted));
                line.Children.Add(copy);b.Content=new Border{BorderThickness=new Thickness(0,1,0,0),BorderBrush=Line,Child=line};
                b.Click+=async(s,e)=>await Open(chat);rows.Children.Add(b);
                if(focused==chat.id && expanded) b.Focus();
            }
            AddFold();scroll.ScrollToVerticalOffset(offset);
        }
        void Message(string message) {notice.Text=message??"";notice.Visibility=String.IsNullOrEmpty(message)?Visibility.Collapsed:Visibility.Visible;Place();}
        async Task Open(Chat chat) {
            if(opening||closed)return;opening=true;Message("Opening "+chat.provider+"…");
            try {
                using(var request=new HttpRequestMessage(HttpMethod.Post,"/v1/focus")) {
                    request.Headers.Add("Origin",http.BaseAddress.GetLeftPart(UriPartial.Authority));
                    request.Content=new StringContent(json.Serialize(new{id=chat.id}),Encoding.UTF8,"application/json");
                    using(var response=await http.SendAsync(request)) {
                        var result=json.Deserialize<FocusResult>(await response.Content.ReadAsStringAsync());
                        if(!closed) Message(response.IsSuccessStatusCode && result!=null && result.ok?result.message:"Could not open this chat.");
                    }
                }
                await Poll();
            } catch(Exception) {if(!closed) Message("Could not reach the PC bridge.");}
            finally {opening=false;}
        }
    }

    static class Program {
        [STAThread] static void Main(string[] args) {
            bool managed=args.Length==0;
            int port;
            string value=managed?(Environment.GetEnvironmentVariable("GHOST_DESK_PORT")??"43821"):args[0];
            if(!Int32.TryParse(value,out port)||port<1||port>65535)return;
            bool first;
            using(var mutex=new Mutex(true,@"Local\GhostDeskEdge-"+port,out first))
            using(var reveal=new EventWaitHandle(false,EventResetMode.AutoReset,@"Local\GhostDeskReveal-"+port)) {
                if(!first){reveal.Set();return;}
                var app=new Application();
                var window=new DockWindow(port,managed);
                var listener=ThreadPool.RegisterWaitForSingleObject(reveal,(s,t)=>{
                    if(!app.Dispatcher.HasShutdownStarted) app.Dispatcher.BeginInvoke(new Action(window.Reveal));
                },null,Timeout.Infinite,false);
                try {
                    using(var host=managed?new AppHost(port,window):null) {app.Run(window);}
                } catch(Exception error) {
                    MessageBox.Show(error.Message,"Ghost Desk",MessageBoxButton.OK,MessageBoxImage.Error);
                } finally {listener.Unregister(null);}
                mutex.ReleaseMutex();
            }
        }
    }
}
