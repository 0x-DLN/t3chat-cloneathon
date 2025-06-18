export default async function Home() {
  return (
    <div className="flex-1 flex items-center flex-col justify-center h-full text-foreground text-wrap">
      <h1 className="text-4xl font-bold mb-16">
        Welcome to my scuffed t3chat clone
      </h1>
      <p>Didn&apos;t really have as much time as I wanted to work on this,</p>
      <p>
        So it&apos;s quite rough around the edges & a lot of features are
        missing.
      </p>
      <p>Nevertheless, I quite like how the blocks work.</p>
      <br />
      <p>
        To get started, click the settings in the bottom left and add an API
        key.
      </p>
      <p>
        I&apos;ll try adding some free keys if I can manage before the deadline,
      </p>
      <p>so certain models might work regardless. No promises though.</p>
      <br />
      <p>
        You can exclude blocks from context by clicking the eye button,
        this&apos;ll grey them out.
      </p>
      <p>
        It works a bit like a jupyter notebook, where you can edit the AI&apos;s
        response.
      </p>
      <br />
      <p className="text-muted-foreground">
        it&apos;s basically unusable on mobile atm, sorry about that.
      </p>
    </div>
  );
}
