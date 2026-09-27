import { SiteHeader } from "@/components/site-header";
import { Workspace } from "@/components/workspace";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pb-16 sm:px-6">
      <SiteHeader />
      <main>
        <Workspace />
      </main>
    </div>
  );
}
