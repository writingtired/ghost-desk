using System;
using System.Drawing;

namespace GhostDesk {
    internal enum DockEdge { Left, Right, Top, Bottom }

    internal static class DockPlacement {
        internal static bool Horizontal(DockEdge edge) {
            return edge==DockEdge.Top || edge==DockEdge.Bottom;
        }
        static int Distance(DockEdge edge, Rectangle area, Point cursor) {
            switch(edge) {
                case DockEdge.Left: return Math.Max(0,cursor.X-area.Left);
                case DockEdge.Right: return Math.Max(0,area.Right-1-cursor.X);
                case DockEdge.Top: return Math.Max(0,cursor.Y-area.Top);
                default: return Math.Max(0,area.Bottom-1-cursor.Y);
            }
        }
        internal static DockEdge Nearest(Rectangle area, Point cursor, DockEdge previous) {
            var best=previous;
            foreach(DockEdge edge in Enum.GetValues(typeof(DockEdge))) {
                if(Distance(edge,area,cursor)<Distance(best,area,cursor)) best=edge;
            }
            return best;
        }
        // Store the center along the edge as a fraction of this monitor's work
        // area. The same anchor applies to the rail and expanded window.
        internal static double Anchor(DockEdge edge, Rectangle area, Point cursor, Size size, double grab) {
            bool horizontal=Horizontal(edge);
            double pointer=horizontal?cursor.X-area.Left:cursor.Y-area.Top;
            int length=horizontal?area.Width:area.Height;
            int extent=horizontal?size.Width:size.Height;
            double center=pointer+(.5-grab)*extent;
            return Math.Max(0,Math.Min(1,center/Math.Max(1,length)));
        }
        internal static Rectangle Bounds(DockEdge edge, Rectangle area, Size size, double anchor) {
            int w=Math.Min(size.Width,area.Width), h=Math.Min(size.Height,area.Height);
            int x=area.Left+(int)Math.Round(Math.Max(0,Math.Min(area.Width-w,area.Width*anchor-w/2.0)));
            int y=area.Top+(int)Math.Round(Math.Max(0,Math.Min(area.Height-h,area.Height*anchor-h/2.0)));
            switch(edge) {
                case DockEdge.Left: x=area.Left;break;
                case DockEdge.Right: x=area.Right-w;break;
                case DockEdge.Top: y=area.Top;break;
                case DockEdge.Bottom: y=area.Bottom-h;break;
            }
            return new Rectangle(x,y,w,h);
        }
    }
}
