import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Star, StarOff, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { productivityService, type Favorite } from "@/services/erp/productivity";

export function FavoritesMenu({ currentLabel }: { currentLabel?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [isFav, setIsFav] = useState(false);

  const reload = () => {
    setFavs(productivityService.favorites());
    setIsFav(productivityService.isFavorite(pathname));
  };
  useEffect(reload, [pathname]);

  const toggle = () => {
    productivityService.toggleFavorite(currentLabel || pathname, pathname);
    reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="المفضلات">
          {isFav ? <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> : <Star className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[12px]">المفضلات والشاشات المثبتة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggle} className="gap-2 text-xs">
          {isFav ? <StarOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          {isFav ? "إلغاء التثبيت من الشاشة الحالية" : "تثبيت الشاشة الحالية"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {favs.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-muted-foreground text-center">لا توجد شاشات مثبتة</div>
        ) : (
          favs.map(f => (
            <DropdownMenuItem key={f.id} onClick={() => navigate(f.to)} className="gap-2 text-xs">
              <Star className="h-3 w-3 text-amber-500 fill-amber-400" />
              <span className="flex-1 truncate">{f.label}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
