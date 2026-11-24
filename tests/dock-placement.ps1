$ErrorActionPreference='Stop'
$geometry=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '../dock/DockPlacement.cs')
$tests=@'
namespace GhostDesk {
    public static class PlacementTest {
        public static void Run() {
            // Work areas in physical pixels, including a monitor left of the
            // primary and one above it, with taskbars consuming different sides.
            foreach(var area in new[]{new Rectangle(0,0,1920,1040),new Rectangle(-2520,-300,2520,1400),new Rectangle(400,-1200,1920,1160)}) {
                foreach(double scale in new[]{1.0,1.25,1.75}) {
                    foreach(DockEdge edge in Enum.GetValues(typeof(DockEdge))) {
                        bool across=DockPlacement.Horizontal(edge);
                        var size=new Size((int)((across?300:42)*scale),(int)((across?42:300)*scale));
                        var p=new Point(area.Left+area.Width/3,area.Top+area.Height/3);
                        if(edge==DockEdge.Top)p.Y=area.Top;
                        if(edge==DockEdge.Bottom)p.Y=area.Bottom-1;
                        if(edge==DockEdge.Left)p.X=area.Left;
                        if(edge==DockEdge.Right)p.X=area.Right-1;
                        if(DockPlacement.Nearest(area,p,DockEdge.Right)!=edge)throw new Exception("Wrong edge");
                        double anchor=DockPlacement.Anchor(edge,area,p,size,.25);
                        var r=DockPlacement.Bounds(edge,area,size,anchor);
                        double grab=across?r.Left+r.Width*.25:r.Top+r.Height*.25;
                        if(Math.Abs(grab-(across?p.X:p.Y))>1)throw new Exception("Offset lost");
                        foreach(double pos in new[]{0.0,anchor,1.0}) {
                            foreach(var shape in new[]{size,new Size(470,720),new Size(5000,5000)}) {
                                r=DockPlacement.Bounds(edge,area,shape,pos);
                                if(!area.Contains(r))throw new Exception("Window outside work area");
                                if(edge==DockEdge.Top && r.Top!=area.Top || edge==DockEdge.Bottom && r.Bottom!=area.Bottom ||
                                   edge==DockEdge.Left && r.Left!=area.Left || edge==DockEdge.Right && r.Right!=area.Right)
                                    throw new Exception("Edge lost");
                            }
                        }
                    }
                }
            }
        }
    }
}
'@
Add-Type -TypeDefinition ($geometry+[Environment]::NewLine+$tests)
[GhostDesk.PlacementTest]::Run()
'Four-edge geometry passed for offset monitors, taskbars, scaled windows, corners, and expanded bounds.'
