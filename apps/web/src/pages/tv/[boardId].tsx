import Head from "next/head";

import type { NextPageWithLayout } from "~/pages/_app";
import TvView from "~/views/tv";

/**
 * Full-screen wall display for a board. Deliberately has no getLayout, so it
 * renders without the dashboard sidebar — the whole screen is the board.
 */
const TvPage: NextPageWithLayout = () => {
  return (
    <>
      <Head>
        {/* This is an internal display, never something to index. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <TvView />
    </>
  );
};

export default TvPage;
