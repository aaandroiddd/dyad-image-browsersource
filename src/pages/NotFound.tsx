import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { sectionVariants } from "@/utils/animations";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-background text-foreground">
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        whileHover="hover"
      >
        <Card className="bg-card border border-primary/50 shadow-lg shadow-[0_0_15px_hsl(var(--glow)/0.2)] text-center">
          <CardHeader>
            <CardTitle className="text-4xl mb-4">404</CardTitle>
            <CardDescription className="text-xl mb-4">
              Oops! Page not found
            </CardDescription>
            <a href="/" className="text-primary hover:text-primary/80 underline">
              Return to Home
            </a>
          </CardHeader>
        </Card>
      </motion.div>
    </div>
  );
};

export default NotFound;
