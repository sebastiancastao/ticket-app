export type MockEmail = {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  body: string;
};

// Simulated inbox for a moving & courier company. Stands in for a real
// mail integration (IMAP/Gmail API/etc.) until that data source exists.
// Bodies follow the labeled-field format typical of "get a quote" web
// form leads in this industry, which is what makes them extractable.
export const MOCK_EMAILS: MockEmail[] = [
  {
    id: "e1",
    from: "jennifer.walsh@gmail.com",
    subject: "Moving Quote Request - 2 Bedroom Apartment",
    receivedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    body: "Hi,\n\nI found your company online and would like a quote.\n\nName: Jennifer Walsh\nPhone: (312) 555-0148\nEmail: jennifer.walsh@gmail.com\nPickup Address: 4521 N Clark St, Apt 3B, Chicago, IL 60640\nDelivery Address: 892 W Fullerton Ave, Apt 12, Chicago, IL 60614\nPreferred Move Date: September 6, 2026\nService Type: Local Move\nInventory: 2-bedroom apartment - queen bed, sofa, dining table with 4 chairs, ~35 boxes\n\nPlease let me know your availability. No rush, I'm flexible on the exact date.\n\nThanks,\nJennifer",
  },
  {
    id: "e2",
    from: "marcus.reid@outlook.com",
    subject: "URGENT - Need long-distance move quote ASAP, relocating for new job",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    body: "Hello,\n\nI need to move ASAP - my new job starts in two weeks and I still don't have a mover booked. Please treat this as urgent.\n\nName: Marcus Reid\nPhone: (615) 555-0173\nEmail: marcus.reid@outlook.com\nPickup Address: 118 Peachtree Rd, Nashville, TN 37203\nDelivery Address: 2200 Riverside Dr, Austin, TX 78704\nPreferred Move Date: August 25, 2026\nService Type: Long-Distance Move\nInventory: 3-bedroom house - full furniture, washer/dryer, home gym equipment (~180 boxes total, estimated 9,000 lbs)\n\nCan someone call me today?\n\nMarcus",
  },
  {
    id: "e3",
    from: "operations@brightlinesupply.com",
    subject: "Freight Pickup Request - 6 Pallets, Warehouse to Distribution Center",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    body: "Hi team,\n\nWe need a freight pickup scheduled for next week.\n\nName: David Chen (Operations Manager, Brightline Supply Co.)\nPhone: (773) 555-0192\nEmail: operations@brightlinesupply.com\nPickup Address: 900 Industrial Pkwy, Unit 4, Elk Grove Village, IL 60007\nDelivery Address: 4750 Distribution Way, Joliet, IL 60431\nPreferred Pickup Date: August 27, 2026\nService Type: Freight Shipment (LTL)\nInventory: 6 pallets of packaged retail goods, approx. 4,200 lbs total, shrink-wrapped and palletized\n\nWe're flexible on the exact time, just need it done sometime that week.\n\nBest,\nDavid",
  },
  {
    id: "e4",
    from: "paralegal@haywardlawgroup.com",
    subject: "Same-Day Courier Needed - Legal Documents Downtown",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    body: "Hello,\n\nWe need a same-day courier to deliver time-sensitive legal documents this afternoon. This is time-critical - the filing deadline is 5 PM today.\n\nName: Priya Anand (Paralegal, Hayward Law Group)\nPhone: (212) 555-0164\nEmail: paralegal@haywardlawgroup.com\nPickup Address: 55 Water St, 21st Floor, New York, NY 10041\nDelivery Address: 60 Centre St, New York, NY 10007\nPreferred Pickup Date: Today, August 19, 2026 - as soon as possible\nService Type: Same-Day Courier\nInventory: Sealed legal document envelope (court filing)\n\nPlease confirm ASAP.\n\nPriya",
  },
];
