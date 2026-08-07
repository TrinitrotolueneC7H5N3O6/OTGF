"use client";

import { IconLink } from "@/components/shared/Icons";

export type HowStep = {
  id: string;
  title: string;
  detail: string;
};

export const HOW_STEPS: HowStep[] = [
  {
    id: "share",
    title: "Share one link everywhere",
    detail:
      "Put the same link on your website, Google Maps, Yelp, Instagram, and any other place customers find you.",
  },
  {
    id: "customer",
    title: "Each customer gets a private chat",
    detail:
      "A customer opens the link and starts a private conversation with your business.",
  },
  {
    id: "inbox",
    title: "You see every conversation",
    detail:
      "All chats land in one floor inbox. You open a chat and reply from there.",
  },
  {
    id: "reply",
    title: "Reply with text and photos",
    detail:
      "Send messages and photos from your library without leaving the conversation.",
  },
  {
    id: "live",
    title: "Know who is live. End when done",
    detail:
      "See when a customer is on the chat. End the chat when the conversation is finished.",
  },
  {
    id: "fit",
    title: "A good fit when…",
    detail: "These are the situations where this layer helps most.",
  },
];

export const FIT_SITUATIONS = [
  "High volume or surges in certain hours",
  "Services where people ask a lot of questions",
  "Services where people hesitate to share private details",
  "Services with quick, one-off questions",
  "The same questions repeat all day — hours, price, availability",
  "Customers find you on Maps, Yelp, or Instagram and need a private line",
  "Walk-ins and appointments mix in the same day",
  "You need to send photos or examples before someone visits",
  "After-hours messages still need a clear place to land",
  "More than one person on the floor answers customers",
];

export function HowDemoFrame({ stepIndex }: { stepIndex: number }) {
  const step = HOW_STEPS[stepIndex] ?? HOW_STEPS[0];
  const isFit = step.id === "fit";

  return (
    <div className={`how-demo${isFit ? " is-fit" : ""}`} data-step={step.id}>
      <div className="how-demo-stage">
        {step.id === "share" ? <ShareMock /> : null}
        {step.id === "customer" ? <CustomerMock /> : null}
        {step.id === "inbox" ? <InboxMock /> : null}
        {step.id === "reply" ? <ReplyMock /> : null}
        {step.id === "live" ? <LiveMock /> : null}
        {step.id === "fit" ? <FitMock /> : null}
      </div>
      {!isFit ? (
        <div className="how-demo-caption">
          <p className="how-demo-step">
            {stepIndex + 1} / {HOW_STEPS.length}
          </p>
          <h2>{step.title}</h2>
          <p>{step.detail}</p>
        </div>
      ) : (
        <div className="how-demo-caption how-demo-caption-fit">
          <p className="how-demo-step">
            {stepIndex + 1} / {HOW_STEPS.length}
          </p>
          <h2>{step.title}</h2>
        </div>
      )}
    </div>
  );
}

function ShareMock() {
  return (
    <div className="shot shot-share">
      <div className="shot-chrome">
        <span />
        <span />
        <span />
      </div>
      <div className="shot-share-body">
        <p className="shot-kicker">Your entry link</p>
        <code>yoursite.com/your-shop</code>
        <ul>
          <li>Website</li>
          <li>Google Maps</li>
          <li>Yelp</li>
          <li>Instagram</li>
        </ul>
        <p className="shot-note">
          <IconLink size={14} /> One link. Every channel.
        </p>
      </div>
    </div>
  );
}

function CustomerMock() {
  return (
    <div className="shot shot-phone">
      <div className="shot-phone-notch" />
      <div className="shot-phone-head">
        <strong>Your shop</strong>
        <span>With Maya</span>
      </div>
      <div className="shot-phone-stream">
        <div className="shot-bubble is-them">
          Hi — do you have time for a fade today?
        </div>
        <div className="shot-bubble is-you">Yes. Walk in after 2.</div>
      </div>
      <div className="shot-phone-composer">Message…</div>
    </div>
  );
}

function InboxMock() {
  return (
    <div className="shot shot-floor">
      <div className="shot-floor-rail">
        <div className="shot-row is-active">
          <span className="shot-ava">JL</span>
          <div>
            <strong>Jordan Lee</strong>
            <p>Do you have time for a fade…</p>
          </div>
          <em>2m</em>
        </div>
        <div className="shot-row">
          <span className="shot-ava">AS</span>
          <div>
            <strong>Alex S.</strong>
            <p>Thanks — see you Saturday</p>
          </div>
          <em>18m</em>
        </div>
        <div className="shot-row">
          <span className="shot-ava">G3</span>
          <div>
            <strong>Guest 3</strong>
            <p>Price for a color?</p>
          </div>
          <em className="is-wait">4m</em>
        </div>
      </div>
      <div className="shot-floor-thread">
        <header>
          <strong>Jordan Lee</strong>
          <span className="shot-live">Live</span>
        </header>
        <div className="shot-floor-msgs">
          <p className="is-client">Do you have time for a fade today?</p>
          <p className="is-biz">Yes. Walk in after 2.</p>
        </div>
      </div>
    </div>
  );
}

function ReplyMock() {
  return (
    <div className="shot shot-floor shot-reply">
      <div className="shot-floor-thread is-wide">
        <header>
          <strong>Alex S.</strong>
        </header>
        <div className="shot-floor-msgs">
          <p className="is-client">Can I see the cut from last week?</p>
          <div className="shot-photo" aria-hidden />
          <p className="is-biz">Here is the finish from Saturday.</p>
        </div>
        <footer>
          <span>Message…</span>
          <button type="button" tabIndex={-1}>
            →
          </button>
        </footer>
      </div>
      <div className="shot-lib">
        <p>Artifacts</p>
        <div className="shot-lib-grid">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function LiveMock() {
  return (
    <div className="shot shot-floor shot-live">
      <div className="shot-floor-thread is-wide">
        <header>
          <strong>Guest 3</strong>
          <span className="shot-live">Live</span>
          <button type="button" className="shot-end" tabIndex={-1}>
            End chat
          </button>
        </header>
        <div className="shot-floor-msgs">
          <p className="is-client">Price for a color?</p>
          <p className="is-biz">Starts at $120. Want a slot?</p>
          <p className="is-system">Chat ended</p>
        </div>
      </div>
    </div>
  );
}

function FitMock() {
  return (
    <div className="shot shot-fit">
      <ul className="fit-list">
        {FIT_SITUATIONS.map((item) => (
          <li key={item}>
            <span className="fit-mark" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
