import type { TripData } from "../data/portal";
import { displayDate } from "../data/display-date";
import { Icon } from "./Icon";
import { TripFacts } from "./TripFacts";

export function TripMetadata({ data }: { data: TripData }) {
  return (
    <>
      <p className="trip-meta">
        <span>
          <Icon name="pin" size={16} />
          {data.trip.destination}
        </span>
        <span>
          <Icon name="itinerary" size={16} />
          {displayDate(data.trip.start)} - {displayDate(data.trip.end)}
        </span>
      </p>
      <TripFacts
        timezone={data.timezone}
        rate={data.rate}
        currency={data.currency}
      />
    </>
  );
}
