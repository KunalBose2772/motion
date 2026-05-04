import { 
  Archive, Bed, Book, Box, Coffee, Computer, Cpu, Fan, Flame, 
  Gamepad, HardDrive, Home, Lamp, Laptop, Layout, Library, 
  Luggage, Microwave, Monitor, Package, Paintbrush, Palette, 
  Pencil, Phone, Printer, Refrigerator, Sofa, Speaker, Tablet, 
  Tv, Utensils, WashingMachine, Watch, Wind, 
  Dumbbell, Bike, Flower2, Clock, MapPin, Trash2, Droplets, 
  Thermometer, Power, Battery, Zap, Frame, ShoppingBag, 
  Container, Waves, Table, Armchair
} from "lucide-react";

export const CLASS_ICONS: Record<string, React.ElementType> = {
  almirah: Archive, wardrobe: Archive, cupboard: Library, bookshelf: Book, cabinet: Library, "crockery unit": Utensils,
  "carton box": Package, suitcase: Luggage, "travel bag": ShoppingBag, trunk: Box, backpack: ShoppingBag, "plastic crate": Package,
  "washing machine": WashingMachine, refrigerator: Refrigerator, microwave: Microwave, television: Tv, dishwasher: Utensils,
  "air conditioner": Wind, "water purifier": Droplets, geyser: Thermometer, "induction cooktop": Zap, "gas stove": Flame,
  bed: Bed, sofa: Sofa, couch: Sofa, "dining table": Table, chair: Armchair, desk: Laptop, 
  "center table": Coffee, ottoman: Sofa, "coffee table": Coffee, footrest: Sofa, "dressing table": Frame,
  laptop: Laptop, "desktop computer": Computer, monitor: Monitor, printer: Printer, "ups inverter": Battery,
  "potted plant": Flower2, mirror: Frame, "ceiling fan": Fan, mattress: Bed, "wall clock": Clock,
  "bicycle": Bike, "treadmill": Bike, "dumbbells": Dumbbell, "gas cylinder": Container, "water dispenser": Droplets, "air cooler": Wind,
  "rolled carpet": Layout, "framed painting": Frame,
};

export const CLASS_COLORS: Record<string, string> = {
  bed: "#10b981", // emerald
  sofa: "#8b5cf6", // violet
  chair: "#3b82f6", // blue
  refrigerator: "#06b6d4", // cyan
  "washing machine": "#6366f1", // indigo
  television: "#f43f5e", // rose
  "air conditioner": "#0ea5e9", // sky
  "carton box": "#f59e0b", // amber
  cabinet: "#d946ef", // fuchsia
  wardrobe: "#ec4899", // pink
};

export const DEFAULT_COLOR = "#64748b"; // slate
