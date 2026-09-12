import type { Player } from '../domain/types'

function punishmentPlayer(
  id: string,
  name: string,
  age: number,
  description: string,
  batting: number,
  bowling: number,
  wicketKeeping: number,
  leadership: number,
  overall: number,
): Player {
  return {
    id,
    name,
    country: 'India',
    age,
    description,
    batting,
    bowling,
    wicketKeeping,
    leadership,
    overall,
    basePrice: 0,
    kind: 'PUNISHMENT',
  }
}

/**
 * M10 emergency-only catalog. These players never enter the normal 50-player
 * catalog or either auction round.
 */
export const punishmentPlayerCatalog: readonly Player[] = [
  punishmentPlayer('punishment-001', 'Baskar Boomraj', 58, 'A retired action-film actor whose last innings was filmed in twelve takes.', 19, 8, 11, 25, 16),
  punishmentPlayer('punishment-002', 'Kavin Kumbleton', 12, 'A school kid who claims to bowl spin but will not reveal which direction.', 14, 22, 7, 9, 13),
  punishmentPlayer('punishment-003', 'Murali Mapillai', 54, 'A local uncle who once played district cricket, although the district remains unspecified.', 24, 16, 18, 31, 22),
  punishmentPlayer('punishment-004', 'Devraj Dialogues', 67, 'A retired television actor who appeals directly into whichever camera is closest.', 12, 6, 9, 28, 14),
  punishmentPlayer('punishment-005', 'Prakash Ledger', 39, 'An office accountant who brought his own bat and a receipt for it.', 21, 9, 13, 26, 17),
  punishmentPlayer('punishment-006', 'Naren Flash', 33, 'A wedding photographer who was standing nearby and still has two ceremonies to edit.', 17, 12, 15, 19, 15),
  punishmentPlayer('punishment-007', 'Selvam Parcel', 42, 'A courier who can locate any address except the popping crease.', 16, 18, 8, 23, 16),
  punishmentPlayer('punishment-008', 'Gopi Whiteboard', 36, 'A project manager carrying three markers and no known scoring shots.', 11, 7, 10, 34, 16),
  punishmentPlayer('punishment-009', 'Rishi Rehearsal', 29, 'A theatre understudy who learned the rules during the interval.', 18, 13, 16, 21, 17),
  punishmentPlayer('punishment-010', 'Anbu Auto', 46, 'An auto driver who guarantees a quick single despite heavy traffic.', 25, 14, 6, 27, 18),
  punishmentPlayer('punishment-011', 'Mani Microphone', 51, 'A karaoke host with excellent projection and unreliable footwork.', 13, 8, 12, 30, 16),
  punishmentPlayer('punishment-012', 'Tarun Tripod', 27, 'A video assistant who believes standing perfectly still is elite fielding technique.', 9, 11, 20, 12, 13),
  punishmentPlayer('punishment-013', 'Sundar Snacks', 44, 'A canteen supervisor selected while asking who ordered the extra samosas.', 20, 10, 14, 33, 19),
  punishmentPlayer('punishment-014', 'Ajay PowerPoint', 35, 'A sales trainer with a forty-slide plan for surviving the first over.', 15, 5, 9, 36, 16),
  punishmentPlayer('punishment-015', 'Vicky Balcony', 31, 'A neighbour who has watched thousands of matches from exactly one plastic chair.', 23, 17, 13, 18, 18),
  punishmentPlayer('punishment-016', 'Hari Headphones', 24, 'A podcast editor who may not hear the call for a second run.', 22, 9, 5, 14, 13),
  punishmentPlayer('punishment-017', 'Dinesh Duplicate', 40, 'A photocopy-shop owner whose batting stance is an excellent copy of a poster.', 18, 15, 11, 24, 17),
  punishmentPlayer('punishment-018', 'Kumar Cushion', 49, 'A furniture salesman convinced that soft hands are mostly about upholstery.', 12, 19, 17, 29, 19),
  punishmentPlayer('punishment-019', 'Nitin Noodles', 22, 'A hostel cook who times overs with an instant-noodle packet.', 26, 12, 8, 10, 14),
  punishmentPlayer('punishment-020', 'Rajan Receipt', 45, 'A supermarket cashier with a fast scanner and a very slow run-up.', 10, 21, 14, 20, 16),
  punishmentPlayer('punishment-021', 'Siva Selfie', 28, 'A travel blogger who keeps turning square leg into a photo opportunity.', 19, 6, 23, 16, 16),
  punishmentPlayer('punishment-022', 'Mohan Megaphone', 61, 'A retired sports-day announcer who provides commentary during his own run-up.', 8, 13, 10, 35, 16),
  punishmentPlayer('punishment-023', 'Arun Umbrella', 37, 'An insurance agent prepared for rain, paperwork, and almost nothing else.', 14, 16, 12, 27, 17),
  punishmentPlayer('punishment-024', 'Bala Bluetooth', 32, 'A phone-repair technician who pauses whenever somebody nearby tries to pair a device.', 21, 11, 19, 15, 17),
  punishmentPlayer('punishment-025', 'Senthil Stopwatch', 56, 'A former school timekeeper who declares every delivery slightly overdue.', 9, 20, 7, 32, 17),
  punishmentPlayer('punishment-026', 'Jagan Junction', 43, 'A railway enthusiast who expects all running between wickets to follow a timetable.', 17, 14, 9, 28, 17),
  punishmentPlayer('punishment-027', 'Naveen Notebook', 26, 'A trainee novelist researching a chapter he hoped would involve less sprinting.', 16, 10, 15, 22, 16),
  punishmentPlayer('punishment-028', 'Ashok Extension', 48, 'An electrician who brought an extension cord but forgot the batting gloves.', 13, 18, 6, 30, 17),
]
